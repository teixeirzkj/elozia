"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogButton } from "@/components/ui/dialog";
import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { centsToInput, formatDate, utcToZonedParts } from "@/lib/utils";
import type { PackageOption } from "@/modules/catalog/queries";
import { CURRENCIES } from "@/modules/catalog/schemas";
import { ContactPicker } from "@/modules/contacts/components/contact-picker";
import {
  BOOKING_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PROPOSAL_STATUS_LABELS,
  STAGE_KIND_LABELS,
  type Booking,
  type Opportunity,
  type Option,
  type Proposal,
  type Stage,
} from "@/modules/crm/types";
import { saveBookingAction, saveOpportunityAction, saveProposalAction, saveStageAction } from "../actions";

/** Seletores dependentes de pacote → saída. */
function PackageFields({
  packages,
  packageId,
  departureId,
}: {
  packages: PackageOption[];
  packageId: string | null;
  departureId: string | null;
}) {
  const [selected, setSelected] = useState(packageId ?? "");
  const departures = packages.find((p) => p.id === selected)?.departures ?? [];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField name="package_id" label="Pacote" value={selected} onChange={(e) => setSelected(e.target.value)}>
        <option value="">Nenhum pacote</option>
        {packages
          .filter((p) => p.status !== "closed" || p.id === packageId)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.destination}
            </option>
          ))}
      </SelectField>
      <SelectField name="departure_id" label="Saída" defaultValue={departureId ?? ""} disabled={!selected} key={selected}>
        <option value="">{selected ? "Sem saída definida" : "Escolha um pacote"}</option>
        {departures.map((d) => (
          <option key={d.id} value={d.id}>
            {formatDate(d.departs_on)}
            {d.returns_on ? ` a ${formatDate(d.returns_on)}` : ""}
          </option>
        ))}
      </SelectField>
    </div>
  );
}

function CurrencySelect({ value }: { value?: string }) {
  return (
    <SelectField name="currency" label="Moeda" defaultValue={value ?? "BRL"}>
      {CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </SelectField>
  );
}

export function OpportunityDialog({
  opportunity,
  stages,
  members,
  packages,
  contact,
  timeZone,
  currentUserId,
  label,
}: {
  opportunity?: Opportunity;
  stages: Stage[];
  members: Option[];
  packages: PackageOption[];
  contact?: Option | null;
  timeZone: string;
  currentUserId: string;
  label?: string;
}) {
  const toast = useToast();
  const next = opportunity?.next_contact_at ? utcToZonedParts(opportunity.next_contact_at, timeZone) : null;
  const [stageId, setStageId] = useState(opportunity?.stage_id ?? stages[0]?.id ?? "");
  const isLost = stages.find((s) => s.id === stageId)?.kind === "lost";
  const initialContact = opportunity ? { id: opportunity.contact_id, name: opportunity.contact_name } : (contact ?? null);

  return (
    <DialogButton
      label={label ?? (opportunity ? "Editar" : "Nova oportunidade")}
      icon={opportunity ? <Pencil className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
      variant={opportunity ? "secondary" : "primary"}
      title={opportunity ? "Editar oportunidade" : "Nova oportunidade"}
      size="lg"
    >
      {(close) => (
        <ActionForm
          action={saveOpportunityAction.bind(null, opportunity?.id ?? null)}
          hideSuccess
          onSuccess={(state) => {
            toast.success(state.message ?? "Oportunidade salva.");
            close();
          }}
        >
          <ContactPicker initial={initialContact} locked={Boolean(opportunity || contact)} />
          <PackageFields packages={packages} packageId={opportunity?.package_id ?? null} departureId={opportunity?.departure_id ?? null} />
          <TextField
            name="destination_interest"
            label="Destino de interesse"
            defaultValue={opportunity?.destination_interest ?? ""}
            maxLength={160}
            hint="Use quando o cliente ainda não escolheu um pacote."
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              name="estimated_value"
              label="Valor estimado"
              defaultValue={centsToInput(opportunity?.estimated_value_cents)}
              inputMode="decimal"
              placeholder="0,00"
            />
            <TextField name="intended_date" label="Data pretendida" type="date" defaultValue={opportunity?.intended_date ?? ""} />
            <TextField name="travelers" label="Viajantes" type="number" min={1} defaultValue={opportunity?.travelers ?? ""} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField name="stage_id" label="Etapa" value={stageId} onChange={(e) => setStageId(e.target.value)} required>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
            <SelectField name="owner_id" label="Responsável" defaultValue={opportunity ? (opportunity.owner_id ?? "") : currentUserId}>
              <option value="">Sem responsável</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </SelectField>
          </div>
          {isLost ? (
            <TextField name="lost_reason" label="Motivo da perda" defaultValue={opportunity?.lost_reason ?? ""} required maxLength={500} />
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="next_contact_date" label="Próximo contato" type="date" defaultValue={next?.date ?? ""} />
            <TextField name="next_contact_time" label="Hora" type="time" defaultValue={next?.time ?? ""} />
          </div>
          <TextAreaField name="notes" label="Observações" defaultValue={opportunity?.notes ?? ""} rows={3} maxLength={5000} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancelar
            </Button>
            <SubmitButton>Salvar oportunidade</SubmitButton>
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function ProposalDialog({ opportunityId, proposal, defaultAmount }: { opportunityId: string; proposal?: Proposal; defaultAmount?: number | null }) {
  const toast = useToast();
  return (
    <DialogButton
      label={proposal ? undefined : "Nova proposta"}
      icon={proposal ? <Pencil className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
      ariaLabel={proposal ? "Editar proposta" : undefined}
      variant={proposal ? "ghost" : "secondary"}
      buttonSize={proposal ? "icon" : "sm"}
      title={proposal ? "Editar proposta" : "Nova proposta"}
    >
      {(close) => (
        <ActionForm
          action={saveProposalAction.bind(null, opportunityId, proposal?.id ?? null)}
          hideSuccess
          onSuccess={(state) => {
            toast.success(state.message ?? "Proposta salva.");
            close();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
            <TextField
              name="amount"
              label="Valor oferecido"
              defaultValue={centsToInput(proposal?.amount_cents ?? defaultAmount)}
              inputMode="decimal"
              placeholder="0,00"
              required
            />
            <CurrencySelect value={proposal?.currency} />
          </div>
          <TextAreaField
            name="description"
            label="O que foi oferecido"
            defaultValue={proposal?.description ?? ""}
            rows={4}
            maxLength={5000}
            hint="Itens incluídos, condições e forma de pagamento proposta."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField name="status" label="Situação" defaultValue={proposal?.status ?? "draft"} required>
              {Object.entries(PROPOSAL_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
            <TextField name="valid_until" label="Válida até" type="date" defaultValue={proposal?.valid_until ?? ""} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancelar
            </Button>
            <SubmitButton>Salvar proposta</SubmitButton>
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function BookingDialog({
  booking,
  contact,
  opportunity,
  packages,
}: {
  booking?: Booking;
  contact?: Option | null;
  opportunity?: Pick<Opportunity, "id" | "package_id" | "departure_id" | "travelers" | "estimated_value_cents"> | null;
  packages: PackageOption[];
}) {
  const toast = useToast();
  const initialContact = booking ? { id: booking.contact_id, name: booking.contact_name } : (contact ?? null);
  const opportunityId = booking?.opportunity_id ?? opportunity?.id ?? null;
  return (
    <DialogButton
      label={booking ? undefined : "Nova reserva"}
      icon={booking ? <Pencil className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
      ariaLabel={booking ? "Editar reserva" : undefined}
      variant={booking ? "ghost" : "secondary"}
      buttonSize={booking ? "icon" : "sm"}
      title={booking ? "Editar reserva" : "Nova reserva"}
      description="O pagamento é apenas declarado. Nenhum valor é cobrado pelo sistema."
      size="lg"
    >
      {(close) => (
        <ActionForm
          action={saveBookingAction.bind(null, booking?.id ?? null)}
          hideSuccess
          onSuccess={(state) => {
            toast.success(state.message ?? "Reserva salva.");
            close();
          }}
        >
          {opportunityId ? <input type="hidden" name="opportunity_id" value={opportunityId} /> : null}
          <ContactPicker initial={initialContact} locked={Boolean(booking || contact)} />
          <PackageFields
            packages={packages}
            packageId={booking?.package_id ?? opportunity?.package_id ?? null}
            departureId={booking?.departure_id ?? opportunity?.departure_id ?? null}
          />
          <div className="grid gap-4 sm:grid-cols-[110px_1fr_110px]">
            <TextField name="travelers" label="Viajantes" type="number" min={1} defaultValue={booking?.travelers ?? opportunity?.travelers ?? 1} required />
            <TextField
              name="total"
              label="Valor total"
              defaultValue={centsToInput(booking?.total_cents ?? opportunity?.estimated_value_cents)}
              inputMode="decimal"
              placeholder="0,00"
              required
            />
            <CurrencySelect value={booking?.currency} />
          </div>
          <SelectField name="status" label="Situação da reserva" defaultValue={booking?.status ?? "pending"} required>
            {Object.entries(BOOKING_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <fieldset className="space-y-4 rounded-md border border-line p-4">
            <legend className="px-1 text-[13px] font-semibold">Pagamento declarado</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField name="payment_status" label="Situação" defaultValue={booking?.payment_status ?? "pending"} required>
                {Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectField>
              <SelectField name="payment_method" label="Forma" defaultValue={booking?.payment_method ?? ""}>
                <option value="">Não informada</option>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectField>
              <TextField name="amount_paid" label="Valor pago" defaultValue={centsToInput(booking?.amount_paid_cents)} inputMode="decimal" placeholder="0,00" />
            </div>
            <TextAreaField
              name="payment_notes"
              label="Observações do pagamento"
              defaultValue={booking?.payment_notes ?? ""}
              rows={2}
              maxLength={1000}
              hint="Não registre números de cartão nem códigos de segurança."
            />
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancelar
            </Button>
            <SubmitButton>Salvar reserva</SubmitButton>
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function StageDialog({ stage }: { stage?: Stage }) {
  const toast = useToast();
  return (
    <DialogButton
      label={stage ? undefined : "Nova etapa"}
      icon={stage ? <Pencil className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
      ariaLabel={stage ? `Editar etapa ${stage.name}` : undefined}
      variant={stage ? "ghost" : "primary"}
      buttonSize={stage ? "icon" : "md"}
      title={stage ? "Editar etapa" : "Nova etapa"}
    >
      {(close) => (
        <ActionForm
          action={saveStageAction.bind(null, stage?.id ?? null)}
          hideSuccess
          onSuccess={(state) => {
            toast.success(state.message ?? "Etapa salva.");
            close();
          }}
        >
          <TextField name="name" label="Nome da etapa" defaultValue={stage?.name ?? ""} required maxLength={60} />
          <SelectField
            name="kind"
            label="Tipo"
            defaultValue={stage?.kind ?? "open"}
            hint="Etapas de ganho e de perda encerram a oportunidade e alimentam os relatórios."
            required
          >
            {Object.entries(STAGE_KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancelar
            </Button>
            <SubmitButton>Salvar etapa</SubmitButton>
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}
