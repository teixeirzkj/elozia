import { Settings2 } from "lucide-react";
import type { Metadata } from "next";
import { Button, LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { can, isManager } from "@/lib/permissions";
import { listPackageOptions } from "@/modules/catalog/queries";
import { Board } from "@/modules/pipeline/components/board";
import { OpportunityDialog } from "@/modules/pipeline/components/pipeline-dialogs";
import { getContactOption, listBoard, listStages } from "@/modules/pipeline/queries";
import { listActiveMembers } from "@/modules/settings/queries";

export const metadata: Metadata = { title: "Funil de vendas" };

type Search = { responsavel?: string; pacote?: string; contato?: string };

export default async function FunilPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { supabase, membership, user } = await requireMembership();
  const orgId = membership.organization.id;

  const [stages, members, packages, preselected] = await Promise.all([
    listStages(supabase, orgId),
    listActiveMembers(supabase, orgId),
    listPackageOptions(supabase, orgId),
    getContactOption(supabase, orgId, params.contato),
  ]);
  const opportunities = await listBoard(supabase, orgId, members, { owner: params.responsavel, packageId: params.pacote });

  return (
    <>
      <PageHeader
        title="Funil de vendas"
        description="Oportunidades abertas e as encerradas nos últimos 30 dias. Arraste os cartões entre as etapas."
        actions={
          <>
            {can(membership.role, "settings.crm") ? (
              <LinkButton href="/configuracoes/funil" variant="secondary">
                <Settings2 className="h-4 w-4" aria-hidden="true" />
                Etapas
              </LinkButton>
            ) : null}
            {stages.length > 0 ? (
              <OpportunityDialog
                stages={stages}
                members={members}
                packages={packages}
                contact={preselected}
                timeZone={membership.organization.timezone}
                currentUserId={user.id}
              />
            ) : null}
          </>
        }
      />
      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <select
          name="responsavel"
          defaultValue={params.responsavel ?? ""}
          aria-label="Filtrar por responsável"
          className="elz-field w-full sm:w-auto sm:min-w-48"
        >
          <option value="">Todos os responsáveis</option>
          <option value={user.id}>Minhas oportunidades</option>
          <option value="nenhum">Sem responsável</option>
          {members
            .filter((m) => m.id !== user.id)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
        <select
          name="pacote"
          defaultValue={params.pacote ?? ""}
          aria-label="Filtrar por pacote"
          className="elz-field w-full sm:w-auto sm:min-w-48"
        >
          <option value="">Todos os pacotes</option>
          {packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
        {params.responsavel || params.pacote ? (
          <LinkButton href="/funil" variant="ghost">
            Limpar
          </LinkButton>
        ) : null}
      </form>
      <Board
        stages={stages}
        opportunities={opportunities}
        timeZone={membership.organization.timezone}
        currentUserId={user.id}
        canMoveAll={isManager(membership.role)}
      />
    </>
  );
}
