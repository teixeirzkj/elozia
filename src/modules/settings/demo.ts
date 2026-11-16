"use server";

import { revalidatePath } from "next/cache";
import { fail, failFrom, ok, type ActionState } from "@/lib/action";
import { authorize } from "@/lib/auth/session";

/**
 * Dados de DEMONSTRAÇÃO: totalmente fictícios, marcados com `is_demo = true` e
 * exibidos com o selo "Demonstração". Os contatos não têm telefone, portanto
 * nunca recebem mensagens, e ficam sem consentimento registrado.
 */

const addDays = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

export async function loadDemoDataAction(): Promise<ActionState> {
  try {
    const { supabase, membership, user } = await authorize("organization.manage");
    const orgId = membership.organization.id;

    const { count } = await supabase.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("is_demo", true);
    if (count) return fail("Os dados de demonstração já estão carregados. Remova-os antes de carregar novamente.");

    const { data: stages, error: stageError } = await supabase.from("pipeline_stages").select("id, kind").eq("organization_id", orgId).order("position");
    if (stageError) throw stageError;
    const open = (stages ?? []).filter((s) => s.kind === "open");
    if (open.length === 0) return fail("Crie ao menos uma etapa em andamento no funil antes de carregar a demonstração.");

    const { data: packages, error: pkgError } = await supabase
      .from("packages")
      .insert([
        { organization_id: orgId, is_demo: true, created_by: user.id, name: "Serra Fictícia — fim de semana (demonstração)", destination: "Serra Fictícia", description: "Pacote de exemplo para conhecer o sistema. Não é um produto real.", price_cents: 189000 },
        { organization_id: orgId, is_demo: true, created_by: user.id, name: "Litoral Imaginário — 7 noites (demonstração)", destination: "Litoral Imaginário", description: "Pacote de exemplo para conhecer o sistema. Não é um produto real.", price_cents: 429000 },
      ])
      .select("id");
    if (pkgError) throw pkgError;
    const [serra, litoral] = (packages ?? []).map((p) => p.id as string);

    const { data: departures, error: depError } = await supabase
      .from("package_departures")
      .insert([
        { organization_id: orgId, package_id: serra, departs_on: addDays(30), returns_on: addDays(32), seats_total: 20 },
        { organization_id: orgId, package_id: serra, departs_on: addDays(60), returns_on: addDays(62), seats_total: 20 },
        { organization_id: orgId, package_id: litoral, departs_on: addDays(45), returns_on: addDays(52), seats_total: 30 },
      ])
      .select("id, package_id");
    if (depError) throw depError;

    const names = ["Ana Exemplo", "Bruno Modelo", "Carla Fictícia", "Diego Amostra", "Elisa Demonstração"];
    const { data: contacts, error: contactError } = await supabase
      .from("contacts")
      .insert(
        names.map((name, i) => ({
          organization_id: orgId,
          is_demo: true,
          created_by: user.id,
          name: `${name} (demonstração)`,
          email: `demo${i + 1}@exemplo.test`,
          source: (["indicacao", "instagram", "site", "evento", "telefone"] as const)[i],
          notes: "Contato fictício criado para demonstração.",
        })),
      )
      .select("id");
    if (contactError) throw contactError;

    const depOf = (pkg: string | undefined) => (departures ?? []).find((d) => d.package_id === pkg)?.id ?? null;
    const { error: oppError } = await supabase.from("opportunities").insert(
      (contacts ?? []).map((c, i) => {
        const pkg = i % 2 === 0 ? serra : litoral;
        return {
          organization_id: orgId,
          is_demo: true,
          created_by: user.id,
          owner_id: user.id,
          contact_id: c.id,
          package_id: pkg,
          departure_id: depOf(pkg),
          stage_id: open[i % open.length]!.id,
          travelers: 1 + (i % 4),
          estimated_value_cents: (i % 2 === 0 ? 189000 : 429000) * (1 + (i % 4)),
        };
      }),
    );
    if (oppError) throw oppError;

    revalidatePath("/", "layout");
    return ok("Dados de demonstração carregados. Eles aparecem com o selo “Demonstração”.");
  } catch (error) {
    return failFrom(error);
  }
}

export async function clearDemoDataAction(): Promise<ActionState> {
  try {
    const { supabase, membership } = await authorize("organization.manage");
    const orgId = membership.organization.id;
    // Contatos de demonstração levam junto oportunidades, reservas, tarefas e histórico.
    const r1 = await supabase.from("contacts").delete().eq("organization_id", orgId).eq("is_demo", true);
    if (r1.error) throw r1.error;
    const r2 = await supabase.from("opportunities").delete().eq("organization_id", orgId).eq("is_demo", true);
    if (r2.error) throw r2.error;
    const r3 = await supabase.from("packages").delete().eq("organization_id", orgId).eq("is_demo", true);
    if (r3.error) {
      if (r3.error.code === "23503") {
        return fail("Os contatos de demonstração foram removidos, mas há oportunidades ou reservas reais ligadas aos pacotes de demonstração. Desvincule-as e tente de novo.");
      }
      throw r3.error;
    }
    revalidatePath("/", "layout");
    return ok("Dados de demonstração removidos.");
  } catch (error) {
    return failFrom(error);
  }
}
