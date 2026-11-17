import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageHeader } from "@/components/ui/primitives";
import { requireCapabilityPage } from "@/lib/auth/session";
import { AutomationForm } from "@/modules/automations/components/automation-form";
import { loadRuleOptions } from "@/modules/automations/options";

export const metadata: Metadata = { title: "Nova automação" };

export default async function NovaAutomacaoPage() {
  const { supabase, membership } = await requireCapabilityPage("automations.manage");
  const options = await loadRuleOptions(supabase, membership.organization.id);
  return (
    <>
      <Breadcrumbs items={[{ label: "Automações", href: "/automacoes" }, { label: "Nova automação" }]} />
      <PageHeader title="Nova automação" description="Defina quando a regra dispara e o que o sistema deve fazer." />
      <AutomationForm
        stages={options.stages}
        packages={options.packages.map((p) => ({ id: p.id, name: p.name }))}
        tags={options.tags}
        members={options.members}
        templates={options.templates}
      />
    </>
  );
}
