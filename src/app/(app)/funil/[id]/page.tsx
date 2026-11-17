import { Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ConfirmButton } from "@/components/ui/dialog";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { can, isManager } from "@/lib/permissions";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import { listPackageOptions } from "@/modules/catalog/queries";
import { TaskDialog, TaskList } from "@/modules/contacts/components/tasks";
import { listTasks } from "@/modules/contacts/queries";
import { deleteOpportunityAction } from "@/modules/pipeline/actions";
import { BookingList, ProposalList } from "@/modules/pipeline/components/lists";
import { BookingDialog, OpportunityDialog, ProposalDialog } from "@/modules/pipeline/components/pipeline-dialogs";
import { stageTone } from "@/modules/pipeline/components/stage-tone";
import { getOpportunity, listBookings, listProposals, listStageHistory, listStages } from "@/modules/pipeline/queries";
import { listActiveMembers } from "@/modules/settings/queries";

export const metadata: Metadata = { title: "Oportunidade" };

export default async function OportunidadePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, membership, user } = await requireMembership();
  const orgId = membership.organization.id;
  const tz = membership.organization.timezone;

  const members = await listActiveMembers(supabase, orgId);
  const opportunity = await getOpportunity(supabase, orgId, id, members);
  if (!opportunity) notFound();

  const [stages, packages, proposals, { bookings }, history, tasks] = await Promise.all([
    listStages(supabase, orgId),
    listPackageOptions(supabase, orgId),
    listProposals(supabase, orgId, id),
    listBookings(supabase, orgId, { opportunityId: id }),
    listStageHistory(supabase, orgId, id),
    listTasks(supabase, orgId, { opportunityId: id }),
  ]);
  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const currentStage = stages.find((s) => s.id === opportunity.stage_id);
  const editable = isManager(membership.role) || opportunity.owner_id === null || opportunity.owner_id === user.id;
  const contact = { id: opportunity.contact_id, name: opportunity.contact_name };

  const details: Array<[string, string]> = [
    ["Pacote", opportunity.package_name ?? "—"],
    ["Saída", formatDate(opportunity.departure_date)],
    ["Destino de interesse", opportunity.destination_interest ?? "—"],
    ["Valor estimado", formatMoney(opportunity.estimated_value_cents, opportunity.currency)],
    ["Data pretendida", formatDate(opportunity.intended_date)],
    ["Viajantes", opportunity.travelers ? String(opportunity.travelers) : "—"],
    ["Responsável", opportunity.owner_name ?? "Sem responsável"],
    ["Próximo contato", formatDateTime(opportunity.next_contact_at, tz)],
    ["Última interação", formatDateTime(opportunity.last_interaction_at, tz)],
    ["Criada em", formatDate(opportunity.created_at)],
  ];

  return (
    <>
      <Breadcrumbs items={[{ label: "CRM" }, { label: "Funil de vendas", href: "/funil" }, { label: opportunity.contact_name }]} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-heading font-bold tracking-tight break-words text-fg sm:text-display">
            <Link href={`/contatos/${opportunity.contact_id}`} className="hover:underline">
              {opportunity.contact_name}
            </Link>
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <Badge
              tone={
                currentStage
                  ? stageTone(currentStage, stages)
                  : opportunity.status === "won"
                    ? "won"
                    : opportunity.status === "lost"
                      ? "lost"
                      : "progress"
              }
            >
              {currentStage?.name ?? "—"}
            </Badge>
            {opportunity.is_demo ? <Badge tone="info">Demonstração</Badge> : null}
            {opportunity.package_name ?? opportunity.destination_interest ?? "Sem destino definido"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable ? (
            <OpportunityDialog
              opportunity={opportunity}
              stages={stages}
              members={members}
              packages={packages}
              timeZone={tz}
              currentUserId={user.id}
            />
          ) : null}
          {can(membership.role, "crm.delete") ? (
            <ConfirmButton
              icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
              label="Excluir"
              buttonSize="md"
              title="Excluir oportunidade"
              description="A oportunidade, suas propostas e o histórico de etapas serão excluídos. Reservas já registradas são mantidas. Esta ação não pode ser desfeita."
              confirmLabel="Excluir"
              action={deleteOpportunityAction.bind(null, opportunity.id)}
            />
          ) : null}
        </div>
      </div>

      {!editable ? (
        <Alert tone="info" className="mb-6">
          Esta oportunidade pertence a {opportunity.owner_name ?? "outra pessoa"}. Você pode registrar propostas e tarefas, mas apenas o
          responsável ou um supervisor altera os dados e a etapa.
        </Alert>
      ) : null}
      {opportunity.status === "lost" && opportunity.lost_reason ? (
        <Alert tone="warning" title="Motivo da perda" className="mb-6">
          {opportunity.lost_reason}
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader
              title="Propostas"
              description="Valores e condições oferecidos ao cliente."
              action={<ProposalDialog opportunityId={opportunity.id} defaultAmount={opportunity.estimated_value_cents} />}
            />
            <ProposalList opportunityId={opportunity.id} proposals={proposals} />
          </Card>
          <Card className="overflow-hidden">
            <CardHeader
              title="Reservas"
              description="Vendas fechadas a partir desta oportunidade."
              action={<BookingDialog contact={contact} opportunity={opportunity} packages={packages} />}
            />
            <BookingList bookings={bookings} packages={packages} />
          </Card>
          <Card className="overflow-hidden">
            <CardHeader
              title="Tarefas"
              action={
                <TaskDialog members={members} contactId={opportunity.contact_id} opportunityId={opportunity.id} currentUserId={user.id} />
              }
            />
            <TaskList tasks={tasks} timeZone={tz} emptyText="Crie tarefas para não perder o próximo passo desta negociação." />
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Detalhes" />
            <CardBody>
              <dl className="space-y-3 text-sm">
                {details.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <dt className="text-fg-muted">{label}</dt>
                    <dd className="text-right font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              {opportunity.notes ? (
                <p className="mt-4 border-t border-line pt-4 text-label whitespace-pre-line text-fg-muted">{opportunity.notes}</p>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Histórico de etapas" />
            <CardBody>
              <ol className="space-y-3">
                {history.map((move) => (
                  <li key={move.id} className="text-label">
                    <p className="font-medium">
                      {move.from ? `${stageName.get(move.from) ?? "Etapa removida"} → ` : "Criada em "}
                      {stageName.get(move.to) ?? "Etapa removida"}
                    </p>
                    <p className="text-xs text-fg-subtle">
                      {formatDateTime(move.moved_at, tz)}
                      {move.moved_by ? ` · ${move.moved_by}` : " · automação"}
                    </p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
