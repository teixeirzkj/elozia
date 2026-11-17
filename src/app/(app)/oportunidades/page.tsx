import { Briefcase, KanbanSquare, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button, LinkButton } from "@/components/ui/button";
import { DataList, type DataColumn } from "@/components/ui/data-list";
import { Pagination } from "@/components/ui/pagination";
import { Badge, type BadgeTone, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import { listPackageOptions } from "@/modules/catalog/queries";
import type { Opportunity, StageKind } from "@/modules/crm/types";
import { OpportunityDialog } from "@/modules/pipeline/components/pipeline-dialogs";
import {
  hasAnyOpportunity,
  listOpportunities,
  OPPORTUNITIES_PAGE_SIZE,
  parseOpportunityFilters,
} from "@/modules/pipeline/list-queries";
import { listStages } from "@/modules/pipeline/queries";
import { listActiveMembers } from "@/modules/settings/queries";

export const metadata: Metadata = { title: "Oportunidades" };

const STATUS_TONE: Record<StageKind, BadgeTone> = { open: "progress", won: "won", lost: "lost" };

export default async function OportunidadesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseOpportunityFilters(await searchParams);
  const { supabase, membership, user } = await requireMembership();
  const orgId = membership.organization.id;
  const timeZone = membership.organization.timezone;

  const [stages, members, packages] = await Promise.all([
    listStages(supabase, orgId),
    listActiveMembers(supabase, orgId),
    listPackageOptions(supabase, orgId),
  ]);
  const { opportunities, total, page } = await listOpportunities(supabase, orgId, filters, members);

  const filtered = Boolean(filters.situacao || filters.etapa || filters.responsavel || filters.pacote || filters.q);
  const anyAtAll = opportunities.length > 0 || filtered ? true : await hasAnyOpportunity(supabase, orgId);
  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const filterParams = {
    q: filters.q,
    situacao: filters.situacao,
    etapa: filters.etapa,
    responsavel: filters.responsavel,
    pacote: filters.pacote,
  };
  const firstPageQuery = new URLSearchParams(
    Object.entries(filterParams).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();
  const firstPageHref = firstPageQuery ? `/oportunidades?${firstPageQuery}` : "/oportunidades";

  const newOpportunity =
    stages.length > 0 ? (
      <OpportunityDialog stages={stages} members={members} packages={packages} timeZone={timeZone} currentUserId={user.id} />
    ) : null;

  const columns: DataColumn<Opportunity>[] = [
    {
      key: "contact",
      header: "Contato",
      primary: true,
      cell: (o) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <Link href={`/funil/${o.id}`} className="inline-flex min-h-touch items-center font-semibold text-fg hover:underline md:min-h-0">
            {o.contact_name}
          </Link>
          {o.is_demo ? <Badge tone="info">Demonstração</Badge> : null}
        </span>
      ),
    },
    {
      key: "package",
      header: "Pacote ou destino",
      cell: (o) => {
        const label = o.package_name ?? o.destination_interest;
        return label ? <span className="text-fg">{label}</span> : <span className="text-fg-subtle">Não definido</span>;
      },
    },
    {
      key: "stage",
      header: "Etapa",
      cell: (o) => <Badge tone={STATUS_TONE[o.status]}>{stageName.get(o.stage_id) ?? "—"}</Badge>,
    },
    {
      key: "value",
      header: "Valor estimado",
      align: "end",
      className: "whitespace-nowrap tabular-nums",
      cell: (o) => formatMoney(o.estimated_value_cents, o.currency),
    },
    {
      key: "travelers",
      header: "Viajantes",
      align: "end",
      hideOnMobile: true,
      className: "tabular-nums",
      cell: (o) => o.travelers ?? "—",
    },
    {
      key: "owner",
      header: "Responsável",
      className: "whitespace-nowrap",
      cell: (o) =>
        o.owner_id ? (
          (o.owner_name ?? <span className="text-fg-subtle">Colaborador inativo</span>)
        ) : (
          <span className="text-fg-subtle">Sem responsável</span>
        ),
    },
    {
      key: "next",
      header: "Próximo contato",
      className: "whitespace-nowrap",
      cell: (o) => (o.status === "open" && o.next_contact_at ? formatDateTime(o.next_contact_at, timeZone) : "—"),
    },
    {
      key: "created",
      header: "Criada em",
      hideOnMobile: true,
      className: "whitespace-nowrap text-fg-muted",
      cell: (o) => formatDate(new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(o.created_at))),
    },
  ];

  return (
    <>
      <PageHeader
        title="Oportunidades"
        description="Todas as negociações da agência, abertas, ganhas e perdidas, em uma lista com filtros."
        actions={
          <>
            <LinkButton href="/funil" variant="secondary">
              <KanbanSquare className="h-4 w-4" aria-hidden="true" />
              Ver no quadro
            </LinkButton>
            {newOpportunity}
          </>
        }
      />

      {!anyAtAll ? (
        <Card>
          <EmptyState
            icon={Briefcase}
            title="Nenhuma oportunidade ainda"
            description={
              stages.length > 0
                ? "Registre a primeira negociação para acompanhar etapa, valor e próximo contato de cada cliente."
                : "Cadastre as etapas do funil antes de registrar oportunidades."
            }
            action={newOpportunity ?? <LinkButton href="/funil">Ir para o funil</LinkButton>}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <form
            method="get"
            role="search"
            aria-label="Filtrar oportunidades"
            className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)_auto]"
          >
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
              <input
                name="q"
                type="search"
                defaultValue={filters.q ?? ""}
                placeholder="Buscar pelo nome do contato"
                aria-label="Buscar pelo nome do contato"
                className="elz-field pl-9 max-md:min-h-touch"
              />
            </div>
            <select name="situacao" defaultValue={filters.situacao ?? ""} aria-label="Filtrar por situação" className="elz-field max-md:min-h-touch">
              <option value="">Todas as situações</option>
              <option value="aberta">Abertas</option>
              <option value="ganha">Ganhas</option>
              <option value="perdida">Perdidas</option>
            </select>
            <select name="etapa" defaultValue={filters.etapa ?? ""} aria-label="Filtrar por etapa" className="elz-field max-md:min-h-touch">
              <option value="">Todas as etapas</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select name="responsavel" defaultValue={filters.responsavel ?? ""} aria-label="Filtrar por responsável" className="elz-field max-md:min-h-touch">
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
            <select name="pacote" defaultValue={filters.pacote ?? ""} aria-label="Filtrar por pacote" className="elz-field max-md:min-h-touch">
              <option value="">Todos os pacotes</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
              <Button type="submit" variant="secondary" className="min-h-touch flex-1 md:min-h-0 lg:flex-none">
                Filtrar
              </Button>
              {filtered ? (
                <LinkButton href="/oportunidades" variant="ghost" className="min-h-touch md:min-h-0">
                  Limpar
                </LinkButton>
              ) : null}
            </div>
          </form>

          {opportunities.length === 0 ? (
            page > 1 ? (
              <EmptyState
                icon={Search}
                title="Esta página está vazia"
                description="A lista tem menos páginas do que o endereço indica."
                action={
                  <LinkButton href={firstPageHref} variant="secondary">
                    Ir para a primeira página
                  </LinkButton>
                }
              />
            ) : (
              <EmptyState
                icon={Search}
                title="Nenhuma oportunidade encontrada"
                description="Nenhuma oportunidade corresponde aos filtros escolhidos."
                action={
                  <LinkButton href="/oportunidades" variant="secondary">
                    Limpar filtros
                  </LinkButton>
                }
              />
            )
          ) : (
            <>
              <DataList
                columns={columns}
                rows={opportunities}
                getKey={(o) => o.id}
                caption="Oportunidades da agência"
              />
              <Pagination
                page={page}
                pageSize={OPPORTUNITIES_PAGE_SIZE}
                total={total}
                basePath="/oportunidades"
                params={filterParams}
              />
            </>
          )}
        </Card>
      )}
    </>
  );
}
