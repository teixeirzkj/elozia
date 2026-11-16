import { ArrowLeft, History, Kanban, Mail, MessagesSquare, Phone, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LinkButton } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/dialog";
import { Badge, Card, CardBody, CardHeader, EmptyState, TagChip } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { formatDate, formatDateTime, formatPhone } from "@/lib/utils";
import { listPackageOptions } from "@/modules/catalog/queries";
import { deleteContactAction } from "@/modules/contacts/actions";
import { ContactDialog, EventForm } from "@/modules/contacts/components/contact-dialogs";
import { TaskDialog, TaskList } from "@/modules/contacts/components/tasks";
import { getContact, listContactEvents, listTags, listTasks } from "@/modules/contacts/queries";
import { CONSENT_LABELS, CONTACT_SOURCES, EVENT_TYPE_LABELS } from "@/modules/crm/types";
import { BookingList, OpportunityList } from "@/modules/pipeline/components/lists";
import { BookingDialog, OpportunityDialog } from "@/modules/pipeline/components/pipeline-dialogs";
import { listBookings, listOpportunitiesByContact, listStages } from "@/modules/pipeline/queries";
import { listActiveMembers } from "@/modules/settings/queries";

export const metadata: Metadata = { title: "Contato" };

export default async function ContatoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, membership, user } = await requireMembership();
  const orgId = membership.organization.id;
  const tz = membership.organization.timezone;

  const contact = await getContact(supabase, orgId, id);
  if (!contact) notFound();

  const members = await listActiveMembers(supabase, orgId);
  const [tags, events, opportunities, { bookings }, tasks, stages, packages, conversation] = await Promise.all([
    listTags(supabase, orgId),
    listContactEvents(supabase, orgId, id),
    listOpportunitiesByContact(supabase, orgId, id, members),
    listBookings(supabase, orgId, { contactId: id }),
    listTasks(supabase, orgId, { contactId: id }),
    listStages(supabase, orgId),
    listPackageOptions(supabase, orgId),
    supabase.from("conversations").select("id").eq("organization_id", orgId).eq("contact_id", id).order("last_message_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const ownerName = contact.owner_id ? members.find((m) => m.id === contact.owner_id)?.name : null;
  const option = { id: contact.id, name: contact.name };
  const conversationId = (conversation.data?.id as string | undefined) ?? null;

  return (
    <>
      <Link href="/contatos" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Contatos
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{contact.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {contact.is_demo ? <Badge tone="info">Demonstração</Badge> : null}
            {contact.tags.map((t) => (
              <TagChip key={t.id} name={t.name} color={t.color} />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {conversationId ? (
            <LinkButton href={`/atendimentos?conversa=${conversationId}`} variant="secondary">
              <MessagesSquare className="h-4 w-4" aria-hidden="true" />
              Abrir conversa
            </LinkButton>
          ) : null}
          <ContactDialog contact={contact} members={members} tags={tags} />
          {can(membership.role, "crm.delete") ? (
            <ConfirmButton
              icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
              label="Excluir"
              buttonSize="md"
              title="Excluir contato"
              description={`${contact.name} será excluído com oportunidades, reservas, conversas e histórico. Esta ação não pode ser desfeita.`}
              confirmLabel="Excluir contato"
              action={deleteContactAction.bind(null, contact.id)}
            />
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader
              title="Oportunidades"
              action={
                stages.length > 0 ? (
                  <OpportunityDialog stages={stages} members={members} packages={packages} contact={option} timeZone={tz} currentUserId={user.id} label="Nova oportunidade" />
                ) : null
              }
            />
            {opportunities.length === 0 ? (
              <EmptyState icon={Kanban} title="Nenhuma oportunidade" description="Crie uma oportunidade para acompanhar esta negociação no funil." className="py-8" />
            ) : (
              <OpportunityList opportunities={opportunities} stages={stages} />
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Reservas" action={<BookingDialog contact={option} packages={packages} />} />
            <BookingList bookings={bookings} packages={packages} />
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Histórico de interações" description="Anotações, ligações e eventos automáticos deste contato." />
            <CardBody className="border-b border-line">
              <EventForm contactId={contact.id} />
            </CardBody>
            {events.length === 0 ? (
              <EmptyState icon={History} title="Sem histórico" description="As interações registradas aparecem aqui." className="py-8" />
            ) : (
              <ol className="divide-y divide-line">
                {events.map((event) => (
                  <li key={event.id} className="px-5 py-3">
                    <p className="flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
                      <Badge>{EVENT_TYPE_LABELS[event.type] ?? event.type}</Badge>
                      {formatDateTime(event.created_at, tz)}
                      {event.actor_name ? <span>· {event.actor_name}</span> : null}
                    </p>
                    {event.body ? <p className="mt-1 text-sm whitespace-pre-line">{event.body}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Dados do contato" />
            <CardBody className="space-y-3 text-sm">
              <p className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                <span className="sr-only">Telefone:</span>
                {formatPhone(contact.phone_e164)}
              </p>
              <p className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                <span className="sr-only">E-mail:</span>
                <span className="min-w-0 break-all">{contact.email ?? "—"}</span>
              </p>
              <dl className="space-y-3 border-t border-line pt-3">
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-muted">Origem</dt>
                  <dd className="font-medium">{CONTACT_SOURCES[contact.source]}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-muted">Responsável</dt>
                  <dd className="font-medium">{ownerName ?? "Sem responsável"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-muted">Cadastro</dt>
                  <dd className="font-medium">{formatDate(contact.created_at)}</dd>
                </div>
              </dl>
              {contact.notes ? <p className="border-t border-line pt-3 text-[13px] whitespace-pre-line text-fg-muted">{contact.notes}</p> : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Comunicações comerciais" />
            <CardBody className="space-y-2 text-sm">
              <Badge tone={contact.marketing_consent === "granted" ? "brand" : contact.marketing_consent === "revoked" ? "danger" : "neutral"}>
                {CONSENT_LABELS[contact.marketing_consent]}
              </Badge>
              {contact.marketing_consent === "granted" ? (
                <p className="text-[13px] text-fg-muted">
                  Registrado em {formatDateTime(contact.consent_at, tz)}
                  {contact.consent_source ? ` · ${contact.consent_source}` : ""}
                </p>
              ) : contact.marketing_consent === "revoked" ? (
                <p className="text-[13px] text-fg-muted">
                  Descadastrado em {formatDateTime(contact.opted_out_at, tz)}. Campanhas e mensagens automáticas não são enviadas.
                </p>
              ) : (
                <p className="text-[13px] text-fg-muted">
                  Sem autorização registrada, este contato não recebe campanhas. Edite o contato para registrar o consentimento.
                </p>
              )}
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Tarefas" action={<TaskDialog members={members} contactId={contact.id} currentUserId={user.id} />} />
            <TaskList tasks={tasks} timeZone={tz} emptyText="Nenhuma tarefa para este contato." />
          </Card>
        </div>
      </div>
    </>
  );
}
