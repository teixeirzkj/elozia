import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
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
      <Link href="/campanhas" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Campanhas
      </Link>
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
