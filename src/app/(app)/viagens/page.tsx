import { CalendarDays, MapPin, Plane, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button, LinkButton } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { formatDate, formatMoney } from "@/lib/utils";
import { PackageDialog } from "@/modules/catalog/components/catalog-dialogs";
import { listPackages, signedUrls } from "@/modules/catalog/queries";
import { ITEM_STATUS_LABELS } from "@/modules/crm/types";

export const metadata: Metadata = { title: "Viagens" };

const statusTone = { active: "brand", paused: "warning", closed: "neutral" } as const;

export default async function ViagensPage({ searchParams }: { searchParams: Promise<{ q?: string; situacao?: string }> }) {
  const params = await searchParams;
  const { supabase, membership } = await requireMembership();
  const packages = await listPackages(supabase, membership.organization.id, { q: params.q, status: params.situacao });
  const images = await signedUrls(supabase, packages.map((p) => p.image_path).filter((p): p is string => p !== null));
  const canManage = can(membership.role, "catalog.manage");
  const filtered = Boolean(params.q || params.situacao);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Viagens"
        description="Catálogo de pacotes e saídas da agência."
        actions={canManage ? <PackageDialog /> : null}
      />
      <form method="get" className="mb-5 flex flex-wrap gap-2" role="search">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-fg-subtle" aria-hidden="true" />
          <input name="q" defaultValue={params.q ?? ""} placeholder="Buscar por pacote ou destino" aria-label="Buscar pacotes" className="elz-field pl-9" />
        </div>
        <select name="situacao" defaultValue={params.situacao ?? ""} aria-label="Filtrar por situação" className="elz-field w-auto">
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
          <LinkButton href="/viagens" variant="ghost">
            Limpar
          </LinkButton>
        ) : null}
      </form>

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
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {packages.map((pkg) => {
            const upcoming = pkg.departures.filter((d) => d.departs_on >= today && d.status !== "closed");
            const image = pkg.image_path ? images.get(pkg.image_path) : null;
            return (
              <li key={pkg.id}>
                <Link href={`/viagens/${pkg.id}`} className="group block h-full overflow-hidden rounded-lg border border-line bg-surface shadow-card transition-shadow hover:shadow-pop">
                  <div className="relative flex aspect-[16/9] items-center justify-center bg-muted">
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
                      {pkg.is_demo ? <Badge tone="info" className="shadow-card">Demonstração</Badge> : null}
                    </div>
                  </div>
                  <div className="p-4">
                    <h2 className="font-bold group-hover:underline">{pkg.name}</h2>
                    <p className="mt-1 flex items-center gap-1.5 text-[13px] text-fg-muted">
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      {pkg.destination}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-[13px] text-fg-muted">
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                      {upcoming.length === 0
                        ? "Sem saídas futuras"
                        : `${upcoming.length} ${upcoming.length === 1 ? "saída" : "saídas"} · próxima em ${formatDate(upcoming[0]!.departs_on)}`}
                    </p>
                    <p className="mt-3 text-[15px] font-bold">
                      {pkg.price_cents == null ? <span className="text-sm font-medium text-fg-subtle">Valor não informado</span> : formatMoney(pkg.price_cents, pkg.currency)}
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
