import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageHeader } from "@/components/ui/primitives";
import { requireCapabilityPage } from "@/lib/auth/session";
import { loadRuleOptions } from "@/modules/automations/options";
import { CampaignForm } from "@/modules/campaigns/components/campaign-form";

export const metadata: Metadata = { title: "Nova campanha" };

export default async function NovaCampanhaPage({ searchParams }: { searchParams: Promise<{ pacote?: string }> }) {
  const { pacote } = await searchParams;
  const { supabase, membership } = await requireCapabilityPage("automations.manage");
  const options = await loadRuleOptions(supabase, membership.organization.id);
  const packages = options.packages.filter((p) => p.status !== "closed");
  return (
    <>
      <Breadcrumbs items={[{ label: "Campanhas", href: "/campanhas" }, { label: "Nova campanha" }]} />
      <PageHeader title="Nova campanha" description="Uma mensagem aprovada pela Meta para quem demonstrou interesse em uma viagem." />
      <CampaignForm
        packages={packages}
        tags={options.tags}
        templates={options.templates}
        timeZone={membership.organization.timezone}
        initialPackageId={packages.some((p) => p.id === pacote) ? pacote : undefined}
      />
    </>
  );
}
