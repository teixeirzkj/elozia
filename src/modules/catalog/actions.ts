"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fail, failFrom, formObject, invalid, ok, type ActionState } from "@/lib/action";
import { authorize } from "@/lib/auth/session";
import { validateImage } from "@/lib/files";
import { rateLimit, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit";
import { departureSchema, packageSchema } from "./schemas";

export async function savePackageAction(packageId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const image = formData.get("image");
  formData.delete("image");
  const parsed = packageSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  let createdId: string | null = null;
  try {
    const { supabase, membership, user } = await authorize("catalog.manage");
    const orgId = membership.organization.id;
    const { price, ...rest } = parsed.data;
    const values = { ...rest, price_cents: price };

    // Valida a imagem antes de gravar qualquer coisa.
    let upload: { bytes: Uint8Array; mime: string; ext: string } | null = null;
    if (image instanceof File && image.size > 0) {
      if (!(await rateLimit("upload", user.id))) return fail(RATE_LIMITED_MESSAGE);
      const bytes = new Uint8Array(await image.arrayBuffer());
      const check = validateImage(bytes);
      if (!check.ok) return { ok: false, error: "Revise os campos destacados.", fieldErrors: { image: [check.error] } };
      upload = { bytes, ...check.file };
    }

    let id = packageId;
    let previousImage: string | null = null;
    if (id) {
      const { data: current } = await supabase.from("packages").select("image_path").eq("id", id).eq("organization_id", orgId).maybeSingle();
      if (!current) return fail("Pacote não encontrado.");
      previousImage = current.image_path as string | null;
      const { error } = await supabase.from("packages").update(values).eq("id", id).eq("organization_id", orgId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from("packages")
        .insert({ ...values, organization_id: orgId, created_by: user.id })
        .select("id")
        .single();
      if (error) throw error;
      id = data.id as string;
      createdId = id;
    }

    if (upload) {
      const path = `${orgId}/packages/${id}/${randomUUID()}.${upload.ext}`;
      const { error: upError } = await supabase.storage.from("media").upload(path, upload.bytes, { contentType: upload.mime, upsert: false });
      if (upError) return fail("O pacote foi salvo, mas não foi possível enviar a imagem. Tente enviar a imagem novamente.");
      const { error } = await supabase.from("packages").update({ image_path: path }).eq("id", id).eq("organization_id", orgId);
      if (error) throw error;
      if (previousImage) await supabase.storage.from("media").remove([previousImage]);
    }
    revalidatePath("/viagens");
    revalidatePath(`/viagens/${id}`);
  } catch (error) {
    return failFrom(error);
  }
  if (createdId) redirect(`/viagens/${createdId}`);
  return ok("Pacote salvo.");
}

export async function deletePackageAction(packageId: string): Promise<ActionState> {
  try {
    const { supabase, membership } = await authorize("catalog.manage");
    const orgId = membership.organization.id;
    const { data: current } = await supabase.from("packages").select("image_path").eq("id", packageId).eq("organization_id", orgId).maybeSingle();
    if (!current) return fail("Pacote não encontrado.");
    const { error } = await supabase.from("packages").delete().eq("id", packageId).eq("organization_id", orgId);
    if (error) {
      if (error.code === "23503") {
        return fail("Este pacote tem oportunidades ou reservas vinculadas. Altere a situação para Encerrado em vez de excluir.");
      }
      throw error;
    }
    if (current.image_path) await supabase.storage.from("media").remove([current.image_path as string]);
    revalidatePath("/viagens");
  } catch (error) {
    return failFrom(error);
  }
  redirect("/viagens");
}

export async function saveDepartureAction(
  packageId: string,
  departureId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = departureSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const { supabase, membership } = await authorize("catalog.manage");
    const orgId = membership.organization.id;
    const { price, ...rest } = parsed.data;
    const values = { ...rest, price_cents: price };
    const { error } = departureId
      ? await supabase.from("package_departures").update(values).eq("id", departureId).eq("package_id", packageId).eq("organization_id", orgId)
      : await supabase.from("package_departures").insert({ ...values, package_id: packageId, organization_id: orgId });
    if (error) throw error;
    revalidatePath(`/viagens/${packageId}`);
    revalidatePath("/viagens");
    return ok("Saída salva.");
  } catch (error) {
    return failFrom(error);
  }
}

export async function deleteDepartureAction(packageId: string, departureId: string): Promise<ActionState> {
  try {
    const { supabase, membership } = await authorize("catalog.manage");
    const { error } = await supabase
      .from("package_departures")
      .delete()
      .eq("id", departureId)
      .eq("package_id", packageId)
      .eq("organization_id", membership.organization.id);
    if (error) {
      if (error.code === "23503") return fail("Esta saída tem oportunidades ou reservas vinculadas. Altere a situação para Encerrada.");
      throw error;
    }
    revalidatePath(`/viagens/${packageId}`);
    return ok("Saída excluída.");
  } catch (error) {
    return failFrom(error);
  }
}
