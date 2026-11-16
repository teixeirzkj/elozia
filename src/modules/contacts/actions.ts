"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fail, failFrom, formObject, invalid, ok, type ActionState } from "@/lib/action";
import { authorize } from "@/lib/auth/session";
import { rateLimit, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit";
import { zonedToUtc } from "@/lib/utils";
import type { Option } from "@/modules/crm/types";
import { IMPORT_MAX_BYTES, parseContactsCsv, type ImportIssue } from "./import";
import { sanitizeSearch } from "./queries";
import { contactEventSchema, contactSchema, tagSchema, taskSchema } from "./schemas";

export async function saveContactAction(contactId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = contactSchema.safeParse(formObject(formData, ["tags"]));
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;
  let createdId: string | null = null;
  try {
    const { supabase, membership, user } = await authorize("crm.write");
    const orgId = membership.organization.id;
    const now = new Date().toISOString();
    const base = {
      name: input.name,
      phone_e164: input.phone,
      email: input.email,
      notes: input.notes,
      source: input.source,
      owner_id: input.owner_id,
    };

    let id = contactId;
    let previousConsent = "unknown";
    if (id) {
      const { data: current, error: readError } = await supabase
        .from("contacts")
        .select("marketing_consent")
        .eq("id", id)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (readError) throw readError;
      if (!current) return fail("Contato não encontrado.");
      previousConsent = current.marketing_consent as string;
    }
    const consentChanged = input.marketing_consent !== previousConsent;
    const consentFields = consentChanged
      ? {
          marketing_consent: input.marketing_consent,
          consent_at: input.marketing_consent === "granted" ? now : null,
          consent_source: input.marketing_consent === "granted" ? (input.consent_source ?? "Registrado manualmente") : null,
          opted_out_at: input.marketing_consent === "revoked" ? now : null,
        }
      : {};

    if (id) {
      const { error } = await supabase.from("contacts").update({ ...base, ...consentFields }).eq("id", id).eq("organization_id", orgId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from("contacts")
        .insert({ ...base, ...consentFields, organization_id: orgId, created_by: user.id })
        .select("id")
        .single();
      if (error) throw error;
      id = data.id as string;
      createdId = id;
      await supabase.from("contact_events").insert({ organization_id: orgId, contact_id: id, type: "created", body: "Contato cadastrado", actor_id: user.id });
    }

    if (consentChanged) {
      const text =
        input.marketing_consent === "granted"
          ? `Consentimento registrado${input.consent_source ? `: ${input.consent_source}` : ""}`
          : input.marketing_consent === "revoked"
            ? "Descadastro registrado: não enviar comunicações comerciais"
            : "Consentimento marcado como não informado";
      await supabase.from("contact_events").insert({ organization_id: orgId, contact_id: id, type: "consent", body: text, actor_id: user.id });
    }

    const { error: delError } = await supabase.from("contact_tags").delete().eq("contact_id", id).eq("organization_id", orgId);
    if (delError) throw delError;
    if (input.tags.length > 0) {
      const { error: tagError } = await supabase
        .from("contact_tags")
        .insert(input.tags.map((tag_id) => ({ organization_id: orgId, contact_id: id, tag_id })));
      if (tagError) throw tagError;
    }
    revalidatePath("/contatos");
    revalidatePath(`/contatos/${id}`);
  } catch (error) {
    const pg = error as { code?: string };
    if (pg.code === "23505") return fail("Já existe um contato com este telefone.");
    return failFrom(error);
  }
  if (createdId) redirect(`/contatos/${createdId}`);
  return ok("Contato salvo.");
}

export async function deleteContactAction(contactId: string): Promise<ActionState> {
  try {
    const { supabase, membership, user } = await authorize("crm.delete");
    const orgId = membership.organization.id;
    const { error, count } = await supabase.from("contacts").delete({ count: "exact" }).eq("id", contactId).eq("organization_id", orgId);
    if (error) throw error;
    if (!count) return fail("Contato não encontrado.");
    await supabase.from("audit_logs").insert({ organization_id: orgId, actor_id: user.id, action: "contact.deleted", entity: "contact", entity_id: contactId });
    revalidatePath("/contatos");
  } catch (error) {
    return failFrom(error, "Não foi possível excluir. Contatos com reservas vinculadas a viagens não podem ser excluídos.");
  }
  redirect("/contatos");
}

export async function addContactEventAction(contactId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = contactEventSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const { supabase, membership, user } = await authorize("crm.write");
    const { error } = await supabase.from("contact_events").insert({
      organization_id: membership.organization.id,
      contact_id: contactId,
      type: parsed.data.type,
      body: parsed.data.body,
      actor_id: user.id,
    });
    if (error) throw error;
    revalidatePath(`/contatos/${contactId}`);
    return ok("Interação registrada.");
  } catch (error) {
    return failFrom(error);
  }
}

/** Busca rápida para seletores de contato. */
export async function searchContactsAction(term: string): Promise<Option[]> {
  const q = sanitizeSearch(String(term ?? ""));
  try {
    const { supabase, membership } = await authorize();
    let query = supabase.from("contacts").select("id, name, phone_e164").eq("organization_id", membership.organization.id);
    if (q) {
      const digits = q.replace(/\D/g, "");
      const parts = [`name.ilike.%${q}%`];
      if (digits.length >= 3) parts.push(`phone_e164.ilike.%${digits}%`);
      query = query.or(parts.join(","));
    }
    const { data } = await query.order("name").limit(12);
    return (data ?? []).map((c) => ({ id: c.id as string, name: c.phone_e164 ? `${c.name} · ${c.phone_e164}` : (c.name as string) }));
  } catch {
    return [];
  }
}

export type ImportSummary = { imported: number; duplicates: number; issues: ImportIssue[]; totalLines: number };

export async function importContactsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Selecione um arquivo CSV.");
  if (file.size > IMPORT_MAX_BYTES) return fail("O arquivo excede 1 MB. Divida a importação em arquivos menores.");
  if (!/\.csv$/i.test(file.name)) return fail("Envie um arquivo com extensão .csv.");
  const consentConfirmed = formData.get("consent_confirmed") === "on";

  try {
    const { supabase, membership, user } = await authorize("crm.import");
    const orgId = membership.organization.id;
    if (!(await rateLimit("import", orgId))) return fail(RATE_LIMITED_MESSAGE);

    const parsed = parseContactsCsv(await file.text());
    if (!parsed.ok) return fail(parsed.error);
    const issues = [...parsed.issues];

    // Telefones já cadastrados são ignorados (nunca sobrescritos).
    const phones = parsed.rows.map((r) => r.phone_e164).filter((p): p is string => p !== null);
    const existing = new Set<string>();
    for (let i = 0; i < phones.length; i += 200) {
      const { data, error } = await supabase
        .from("contacts")
        .select("phone_e164")
        .eq("organization_id", orgId)
        .in("phone_e164", phones.slice(i, i + 200));
      if (error) throw error;
      for (const row of data ?? []) existing.add(row.phone_e164 as string);
    }

    const now = new Date().toISOString();
    const toInsert = parsed.rows
      .filter((r) => !(r.phone_e164 && existing.has(r.phone_e164)))
      .map((r) => {
        // O consentimento só é gravado se a coluna disser "sim" E quem importa confirmar que tem a autorização.
        const granted = r.consent && consentConfirmed;
        return {
          organization_id: orgId,
          name: r.name,
          phone_e164: r.phone_e164,
          email: r.email,
          notes: r.notes,
          source: "import",
          created_by: user.id,
          marketing_consent: granted ? "granted" : "unknown",
          consent_at: granted ? now : null,
          consent_source: granted ? `Importação CSV (${file.name.slice(0, 80)})` : null,
        };
      });
    const duplicates = parsed.rows.length - toInsert.length;

    let imported = 0;
    for (let i = 0; i < toInsert.length; i += 200) {
      const chunk = toInsert.slice(i, i + 200);
      const { error, count } = await supabase.from("contacts").insert(chunk, { count: "exact" });
      if (error) throw error;
      imported += count ?? chunk.length;
    }
    await supabase.from("audit_logs").insert({
      organization_id: orgId,
      actor_id: user.id,
      action: "contacts.imported",
      entity: "contact",
      metadata: { imported, duplicates, rejected: issues.length },
    });
    revalidatePath("/contatos");
    const summary: ImportSummary = { imported, duplicates, issues: issues.slice(0, 100), totalLines: parsed.totalLines };
    return ok(`${imported} ${imported === 1 ? "contato importado" : "contatos importados"}.`, summary);
  } catch (error) {
    return failFrom(error, "Não foi possível importar o arquivo. Nenhuma alteração parcial deve ser presumida; confira a lista de contatos.");
  }
}

export async function saveTagAction(tagId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = tagSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const { supabase, membership } = await authorize("settings.crm");
    const orgId = membership.organization.id;
    const { error } = tagId
      ? await supabase.from("tags").update(parsed.data).eq("id", tagId).eq("organization_id", orgId)
      : await supabase.from("tags").insert({ ...parsed.data, organization_id: orgId });
    if (error) {
      if (error.code === "23505") return fail("Já existe uma etiqueta com este nome.");
      throw error;
    }
    revalidatePath("/configuracoes/etiquetas");
    return ok("Etiqueta salva.");
  } catch (error) {
    return failFrom(error);
  }
}

export async function deleteTagAction(tagId: string): Promise<ActionState> {
  try {
    const { supabase, membership } = await authorize("settings.crm");
    const { error } = await supabase.from("tags").delete().eq("id", tagId).eq("organization_id", membership.organization.id);
    if (error) throw error;
    revalidatePath("/configuracoes/etiquetas");
    return ok("Etiqueta excluída.");
  } catch (error) {
    return failFrom(error);
  }
}

export async function createTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = taskSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const { supabase, membership, user } = await authorize("crm.write");
    const { due_date, due_time, ...rest } = parsed.data;
    const due_at = due_date ? zonedToUtc(due_date, due_time ?? "09:00", membership.organization.timezone).toISOString() : null;
    const { error } = await supabase.from("tasks").insert({
      ...rest,
      due_at,
      assignee_id: rest.assignee_id ?? user.id,
      organization_id: membership.organization.id,
      created_by: user.id,
    });
    if (error) throw error;
    revalidatePath("/dashboard");
    if (rest.contact_id) revalidatePath(`/contatos/${rest.contact_id}`);
    if (rest.opportunity_id) revalidatePath(`/funil/${rest.opportunity_id}`);
    return ok("Tarefa criada.");
  } catch (error) {
    return failFrom(error);
  }
}

export async function toggleTaskAction(taskId: string, done: boolean): Promise<ActionState> {
  try {
    const { supabase, membership } = await authorize("crm.write");
    const { error } = await supabase
      .from("tasks")
      .update({ done_at: done ? new Date().toISOString() : null })
      .eq("id", taskId)
      .eq("organization_id", membership.organization.id);
    if (error) throw error;
    revalidatePath("/", "layout");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}
