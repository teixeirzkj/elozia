import { CalendarDays, LayoutGrid, MapPin, Plane, Search, Table2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button, LinkButton } from "@/components/ui/button";
import { DataList } from "@/components/ui/data-list";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { PackageDialog } from "@/modules/catalog/components/catalog-dialogs";
import { listPackages, signedUrls } from "@/modules/catalog/queries";
import { ITEM_STATUS_LABELS } from "@/modules/crm/types";

export const metadata: Metadata = { title: "Viagens" };

const statusTone = { active: "brand", paused: "warning", closed: "neutral" } as const;

type Search = { q?: string; situacao?: string; visao?: string };

/** Monta o endereço da listagem preservando busca e filtro. */
function viewHref(params: Search, visao: "cartoes" | "tabela") {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.situacao) query.set("situacao", params.situacao);
  if (visao === "tabela") query.set("visao", "tabela");
  const qs = query.toString();
  return qs ? `/viagens?${qs}` : "/viagens";
}

export default async function ViagensPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { supabase, membership } = await requireMembership();
  const packages = await listPackages(supabase, membership.organization.id, { q: params.q, status: params.situacao });
  const images = await signedUrls(
    supabase,
    packages.map((p) => p.image_path).filter((p): p is string => p !== null),
  );
  const canManage = can(membership.role, "catalog.manage");
  const filtered = Boolean(params.q || params.situacao);
  const today = new Date().toISOString().slice(0, 10);
  const asTable = params.visao === "tabela";

  const rows = packages.map((pkg) => ({
    pkg,
    upcoming: pkg.departures.filter((d) => d.departs_on >= today && d.status !== "closed"),
  }));

  const views = [
    { key: "cartoes" as const, label: "Cartões", icon: LayoutGrid, active: !asTable },
    { key: "tabela" as const, label: "Tabela", icon: Table2, active: asTable },
  ];

  return (
    <>
      <PageHeader title="Viagens" description="Catálogo de pacotes e saídas da agência." actions={canManage ? <PackageDialog /> : null} />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <form method="get" className="flex min-w-0 flex-1 flex-wrap gap-2" role="search">
          {asTable ? <input type="hidden" name="visao" value="tabela" /> : null}
          <div className="relative min-w-56 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-fg-subtle" aria-hidden="true" />
            <input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Buscar por pacote ou destino"
              aria-label="Buscar pacotes"
              className="elz-field pl-9"
            />
          </div>
          <select
            name="situacao"
            defaultValue={params.situacao ?? ""}
            aria-label="Filtrar por situação"
            className="elz-field w-full sm:w-auto"
          >
            <option value="">Todas as situações</option>
            {Object.entries(ITEM_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
          {filtered ? (
            <LinkButton href={asTable ? "/viagens?visao=tabela" : "/viagens"} variant="ghost">
              Limpar
            </LinkButton>
          ) : null}
        </form>

        <nav aria-label="Visualização" className="flex shrink-0 rounded-md border border-line-strong bg-surface p-0.5">
          {views.map((view) => (
            <Link
              key={view.key}
              href={viewHref(params, view.key)}
              aria-current={view.active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-touch items-center gap-1.5 rounded px-3 py-1.5 text-label font-semibold transition-colors sm:min-h-0",
                view.active ? "bg-ink text-white" : "text-fg-muted hover:bg-hover hover:text-fg",
              )}
            >
              <view.icon className="h-4 w-4" aria-hidden="true" />
              {view.label}
            </Link>
          ))}
        </nav>
      </div>

      {packages.length === 0 ? (
        <Card>
          {filtered ? (
            <EmptyState icon={Search} title="Nenhum pacote encontrado" description="Ajuste a busca ou limpe os filtros." />
          ) : (
            <EmptyState
              icon={Plane}
              title="Nenhum pacote cadastrado"
              description={
                canManage
                  ? "Cadastre os pacotes e as saídas que a agência vende para usá-los no funil, nas reservas e nas campanhas."
                  : "Os pacotes são cadastrados por supervisores e administradores da agência."
              }
            />
          )}
        </Card>
      ) : asTable ? (
        <Card className="overflow-hidden">
          <DataList
            caption="Pacotes da agência"
            rows={rows}
            getKey={(row) => row.pkg.id}
            columns={[
              {
                key: "nome",
                header: "Nome",
                primary: true,
                cell: ({ pkg }) => (
                  <div className="min-w-0">
                    <Link href={`/viagens/${pkg.id}`} className="font-semibold hover:underline">
                      {pkg.name}
                    </Link>
                    {pkg.is_demo ? (
                      <Badge tone="info" className="ml-2">
                        Demonstração
                      </Badge>
                    ) : null}
                  </div>
                ),
              },
              { key: "destino", header: "Destino", className: "text-fg-muted", cell: ({ pkg }) => pkg.destination },
              {
                key: "situacao",
                header: "Situação",
                cell: ({ pkg }) => <Badge tone={statusTone[pkg.status]}>{ITEM_STATUS_LABELS[pkg.status]}</Badge>,
              },
              {
                key: "proxima",
                header: "Próxima saída",
                className: "whitespace-nowrap",
                cell: ({ upcoming }) =>
                  upcoming[0] ? formatDate(upcoming[0].departs_on) : <span className="text-fg-subtle">Sem saídas futuras</span>,
              },
              {
                key: "saidas",
                header: "Nº de saídas",
                align: "end",
                className: "tabular-nums",
                cell: ({ pkg }) => pkg.departures.length,
              },
              {
                key: "valor",
                header: "Valor",
                align: "end",
                className: "whitespace-nowrap font-semibold tabular-nums",
                cell: ({ pkg }) =>
                  pkg.price_cents == null ? (
                    <span className="font-normal text-fg-subtle">Não informado</span>
                  ) : (
                    formatMoney(pkg.price_cents, pkg.currency)
                  ),
              },
            ]}
          />
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ pkg, upcoming }) => {
            const image = pkg.image_path ? images.get(pkg.image_path) : null;
            return (
              <li key={pkg.id}>
                <Link
                  href={`/viagens/${pkg.id}`}
                  className="elz-card-hover group block h-full overflow-hidden rounded-lg border border-line bg-surface shadow-card"
                >
                  <div className="relative flex aspect-video items-center justify-center bg-muted">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do bucket privado
                      <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <Plane className="h-8 w-8 text-fg-subtle" aria-hidden="true" />
                    )}
                    <div className="absolute top-2 left-2 flex gap-1.5">
                      <Badge tone={statusTone[pkg.status]} className="shadow-card">
                        {ITEM_STATUS_LABELS[pkg.status]}
                      </Badge>
                      {pkg.is_demo ? (
                        <Badge tone="info" className="shadow-card">
                          Demonstração
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="p-4">
                    <h2 className="font-bold text-fg group-hover:underline">{pkg.name}</h2>
                    <p className="mt-1 flex items-center gap-1.5 text-label text-fg-muted">
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {pkg.destination}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-label text-fg-muted">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {upcoming.length === 0
                        ? "Sem saídas futuras"
                        : `${upcoming.length} ${upcoming.length === 1 ? "saída" : "saídas"} · próxima em ${formatDate(upcoming[0]!.departs_on)}`}
                    </p>
                    <p className="mt-3 text-title font-bold text-fg">
                      {pkg.price_cents == null ? (
                        <span className="text-sm font-medium text-fg-subtle">Valor não informado</span>
                      ) : (
                        formatMoney(pkg.price_cents, pkg.currency)
                      )}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
