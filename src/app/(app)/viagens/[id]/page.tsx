import { CalendarDays, Megaphone, Plane, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { LinkButton } from "@/components/ui/button";
import { DataList } from "@/components/ui/data-list";
import { ConfirmButton } from "@/components/ui/dialog";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { formatDate, formatMoney } from "@/lib/utils";
import { deleteDepartureAction, deletePackageAction } from "@/modules/catalog/actions";
import { DepartureDialog, PackageDialog } from "@/modules/catalog/components/catalog-dialogs";
import { bookedTravelersByDeparture, getPackage, signedUrl } from "@/modules/catalog/queries";
import { ITEM_STATUS_LABELS } from "@/modules/crm/types";

export const metadata: Metadata = { title: "Pacote" };

const statusTone = { active: "brand", paused: "warning", closed: "neutral" } as const;
const feminine = (label: string) => label.replace(/o$/, "a");

export default async function PacotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, membership } = await requireMembership();
  const orgId = membership.organization.id;
  const pkg = await getPackage(supabase, orgId, id);
  if (!pkg) notFound();

  const [image, booked] = await Promise.all([signedUrl(supabase, pkg.image_path), bookedTravelersByDeparture(supabase, orgId, pkg.id)]);
  const canManage = can(membership.role, "catalog.manage");

  return (
    <>
      <Breadcrumbs items={[{ label: "Viagens", href: "/viagens" }, { label: pkg.name }]} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-heading font-bold tracking-tight break-words text-fg sm:text-display">{pkg.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <Badge tone={statusTone[pkg.status]}>{ITEM_STATUS_LABELS[pkg.status]}</Badge>
            {pkg.is_demo ? <Badge tone="info">Demonstração</Badge> : null}
            {pkg.destination}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/funil?pacote=${pkg.id}`} variant="secondary">
            Ver no funil
          </LinkButton>
          {can(membership.role, "automations.manage") ? (
            <LinkButton href={`/campanhas/nova?pacote=${pkg.id}`} variant="secondary">
              <Megaphone className="h-4 w-4" aria-hidden="true" />
              Criar campanha
            </LinkButton>
          ) : null}
          {canManage ? (
            <>
              <PackageDialog pkg={pkg} />
              <ConfirmButton
                icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                label="Excluir"
                buttonSize="md"
                title="Excluir pacote"
                description="O pacote e suas saídas serão excluídos. Pacotes com oportunidades ou reservas não podem ser excluídos."
                confirmLabel="Excluir pacote"
                action={deletePackageAction.bind(null, pkg.id)}
              />
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Saídas"
            description="As vagas são um controle interno da agência e não representam disponibilidade confirmada por fornecedores."
            action={canManage ? <DepartureDialog packageId={pkg.id} /> : null}
          />
          {pkg.departures.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Nenhuma saída cadastrada"
              description="Cadastre as datas de saída deste pacote. Um pacote pode ter várias saídas."
              className="py-10"
            />
          ) : (
            <DataList
              caption={`Saídas do pacote ${pkg.name}`}
              rows={pkg.departures}
              getKey={(d) => d.id}
              columns={[
                {
                  key: "saida",
                  header: "Saída",
                  primary: true,
                  className: "font-semibold whitespace-nowrap",
                  cell: (d) => formatDate(d.departs_on),
                },
                { key: "retorno", header: "Retorno", className: "whitespace-nowrap", cell: (d) => formatDate(d.returns_on) },
                {
                  key: "valor",
                  header: "Valor por pessoa",
                  className: "whitespace-nowrap tabular-nums",
                  cell: (d) => formatMoney(d.price_cents ?? pkg.price_cents, pkg.currency),
                },
                {
                  key: "vagas",
                  header: "Vagas (interno)",
                  className: "whitespace-nowrap",
                  cell: (d) =>
                    d.seats_total == null ? (
                      <span className="text-fg-subtle">Não controladas</span>
                    ) : (
                      <>
                        {d.seats_total}
                        <span className="text-xs text-fg-subtle"> · {booked.get(d.id) ?? 0} em reservas</span>
                      </>
                    ),
                },
                {
                  key: "situacao",
                  header: "Situação",
                  cell: (d) => <Badge tone={statusTone[d.status]}>{feminine(ITEM_STATUS_LABELS[d.status])}</Badge>,
                },
                ...(canManage
                  ? [
                      {
                        key: "acoes",
                        header: "Ações",
                        align: "end" as const,
                        actions: true,
                        cell: (d: (typeof pkg.departures)[number]) => (
                          <div className="flex justify-end gap-1">
                            <DepartureDialog packageId={pkg.id} departure={d} />
                            <ConfirmButton
                              icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                              ariaLabel={`Excluir saída de ${formatDate(d.departs_on)}`}
                              buttonSize="icon"
                              variant="ghost"
                              title="Excluir saída"
                              description={`A saída de ${formatDate(d.departs_on)} será excluída.`}
                              confirmLabel="Excluir"
                              action={deleteDepartureAction.bind(null, pkg.id, d.id)}
                            />
                          </div>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          )}
        </Card>

        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="flex aspect-video items-center justify-center bg-muted">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do bucket privado
                <img src={image} alt={`Imagem do pacote ${pkg.name}`} className="h-full w-full object-cover" />
              ) : (
                <Plane className="h-8 w-8 text-fg-subtle" aria-hidden="true" />
              )}
            </div>
            <CardBody className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-fg-muted">Valor base por pessoa</span>
                <span className="font-bold">{formatMoney(pkg.price_cents, pkg.currency)}</span>
              </div>
              {pkg.description ? <p className="border-t border-line pt-3 whitespace-pre-line text-fg-muted">{pkg.description}</p> : null}
            </CardBody>
          </Card>
          {pkg.commercial_notes ? (
            <Card>
              <CardHeader title="Observações comerciais" description="Uso interno da equipe." />
              <CardBody>
                <p className="text-sm whitespace-pre-line text-fg-muted">{pkg.commercial_notes}</p>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
