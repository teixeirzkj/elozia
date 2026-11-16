import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
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
      <Link href="/automacoes" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Automações
      </Link>
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
