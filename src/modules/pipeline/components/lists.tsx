import { FileText, Ticket } from "lucide-react";
import Link from "next/link";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { formatDate, formatMoney } from "@/lib/utils";
import type { PackageOption } from "@/modules/catalog/queries";
import {
  BOOKING_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PROPOSAL_STATUS_LABELS,
  type Booking,
  type Opportunity,
  type Proposal,
  type Stage,
} from "@/modules/crm/types";
import { BookingDialog, ProposalDialog } from "./pipeline-dialogs";
import { ProposalStatusMenu } from "./proposal-status";

const proposalTone = { draft: "neutral", sent: "info", accepted: "brand", rejected: "danger", expired: "warning" } as const;
const bookingTone = { pending: "warning", confirmed: "brand", cancelled: "danger" } as const;
const paymentTone = { pending: "warning", partial: "info", paid: "brand", refunded: "neutral" } as const;

export function ProposalList({ opportunityId, proposals }: { opportunityId: string; proposals: Proposal[] }) {
  if (proposals.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Nenhuma proposta registrada"
        description="Registre o valor e as condições oferecidas ao cliente."
        className="py-8"
      />
    );
  }
  return (
    <ul className="divide-y divide-line">
      {proposals.map((p) => (
        <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-bold">{formatMoney(p.amount_cents, p.currency)}</span>
              <Badge tone={proposalTone[p.status]}>{PROPOSAL_STATUS_LABELS[p.status]}</Badge>
            </p>
            <p className="mt-0.5 text-xs text-fg-muted">
              Criada em {formatDate(p.created_at)}
              {p.sent_at ? ` · enviada em ${formatDate(p.sent_at)}` : ""}
              {p.valid_until ? ` · válida até ${formatDate(p.valid_until)}` : ""}
            </p>
            {p.description ? <p className="mt-1.5 text-[13px] whitespace-pre-line text-fg-muted">{p.description}</p> : null}
          </div>
          <div className="flex items-center gap-1">
            <ProposalStatusMenu opportunityId={opportunityId} proposalId={p.id} status={p.status} />
            <ProposalDialog opportunityId={opportunityId} proposal={p} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function BookingList({
  bookings,
  packages,
  showContact = false,
}: {
  bookings: Booking[];
  packages: PackageOption[];
  showContact?: boolean;
}) {
  if (bookings.length === 0) {
    return (
      <EmptyState
        icon={Ticket}
        title="Nenhuma reserva registrada"
        description="Reservas são criadas quando a venda é fechada com o cliente."
        className="py-8"
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="elz-table">
        <thead>
          <tr>
            {showContact ? <th scope="col">Contato</th> : null}
            <th scope="col">Viagem</th>
            <th scope="col">Viajantes</th>
            <th scope="col">Total</th>
            <th scope="col">Reserva</th>
            <th scope="col">Pagamento declarado</th>
            <th scope="col" className="text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id}>
              {showContact ? (
                <td>
                  <Link href={`/contatos/${b.contact_id}`} className="font-semibold hover:underline">
                    {b.contact_name}
                  </Link>
                </td>
              ) : null}
              <td>
                {b.package_id ? (
                  <Link href={`/viagens/${b.package_id}`} className="font-medium hover:underline">
                    {b.package_name}
                  </Link>
                ) : (
                  <span className="text-fg-muted">Sem pacote</span>
                )}
                {b.departure_date ? <p className="text-xs text-fg-subtle">Saída {formatDate(b.departure_date)}</p> : null}
              </td>
              <td>{b.travelers}</td>
              <td className="whitespace-nowrap font-semibold">{formatMoney(b.total_cents, b.currency)}</td>
              <td>
                <Badge tone={bookingTone[b.status]}>{BOOKING_STATUS_LABELS[b.status]}</Badge>
              </td>
              <td>
                <Badge tone={paymentTone[b.payment_status]}>{PAYMENT_STATUS_LABELS[b.payment_status]}</Badge>
                <p className="mt-0.5 text-xs whitespace-nowrap text-fg-subtle">
                  {formatMoney(b.amount_paid_cents, b.currency)}
                  {b.payment_method ? ` · ${PAYMENT_METHOD_LABELS[b.payment_method].split(" (")[0]}` : ""}
                </p>
              </td>
              <td className="text-right">
                <BookingDialog booking={b} packages={packages} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OpportunityList({ opportunities, stages }: { opportunities: Opportunity[]; stages: Stage[] }) {
  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  return (
    <ul className="divide-y divide-line">
      {opportunities.map((o) => (
        <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <div className="min-w-0">
            <Link href={`/funil/${o.id}`} className="font-semibold hover:underline">
              {o.package_name ?? o.destination_interest ?? "Oportunidade sem destino definido"}
            </Link>
            <p className="mt-0.5 text-xs text-fg-muted">
              {formatMoney(o.estimated_value_cents, o.currency)} · criada em {formatDate(o.created_at)}
              {o.owner_name ? ` · ${o.owner_name}` : ""}
            </p>
          </div>
          <Badge tone={o.status === "won" ? "brand" : o.status === "lost" ? "danger" : "info"}>{stageName.get(o.stage_id) ?? "—"}</Badge>
        </li>
      ))}
    </ul>
  );
}
