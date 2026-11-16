"use client";

import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogButton } from "@/components/ui/dialog";
import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { formatPhone } from "@/lib/utils";
import {
  CONSENT_LABELS,
  CONTACT_SOURCES,
  EVENT_TYPE_LABELS,
  MANUAL_EVENT_TYPES,
  type Contact,
  type Option,
  type Tag,
} from "@/modules/crm/types";
import { addContactEventAction, saveContactAction } from "../actions";

export function ContactDialog({ contact, members, tags }: { contact?: Contact; members: Option[]; tags: Tag[] }) {
  const toast = useToast();
  const selected = new Set(contact?.tags.map((t) => t.id));
  return (
    <DialogButton
      label={contact ? "Editar" : "Novo contato"}
      icon={contact ? <Pencil className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
      variant={contact ? "secondary" : "primary"}
      title={contact ? "Editar contato" : "Novo contato"}
      size="lg"
    >
      {(close) => (
        <ActionForm
          action={saveContactAction.bind(null, contact?.id ?? null)}
          hideSuccess
          onSuccess={(state) => {
            toast.success(state.message ?? "Contato salvo.");
            close();
          }}
        >
          <TextField name="name" label="Nome" defaultValue={contact?.name ?? ""} required maxLength={160} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="phone"
              label="Telefone (WhatsApp)"
              defaultValue={contact?.phone_e164 ? formatPhone(contact.phone_e164) : ""}
              inputMode="tel"
              hint="Com DDD. Salvo no padrão internacional (E.164)."
            />
            <TextField name="email" label="E-mail" type="email" defaultValue={contact?.email ?? ""} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField name="source" label="Origem" defaultValue={contact?.source ?? "manual"} required>
              {Object.entries(CONTACT_SOURCES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
            <SelectField name="owner_id" label="Responsável comercial" defaultValue={contact?.owner_id ?? ""}>
              <option value="">Sem responsável</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              name="marketing_consent"
              label="Comunicações comerciais"
              defaultValue={contact?.marketing_consent ?? "unknown"}
              hint="Campanhas só são enviadas a quem autorizou."
              required
            >
              {Object.entries(CONSENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
            <TextField
              name="consent_source"
              label="Como a autorização foi obtida"
              defaultValue={contact?.consent_source ?? ""}
              maxLength={200}
              hint="Ex.: formulário do site, pedido por WhatsApp."
            />
          </div>
          {tags.length > 0 ? (
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-semibold">Etiquetas</legend>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <label
                    key={tag.id}
                    className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[13px] has-[:checked]:border-ink has-[:checked]:bg-muted"
                  >
                    <input type="checkbox" name="tags" value={tag.id} defaultChecked={selected.has(tag.id)} className="sr-only" />
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} aria-hidden="true" />
                    {tag.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <TextAreaField name="notes" label="Observações" defaultValue={contact?.notes ?? ""} maxLength={5000} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancelar
            </Button>
            <SubmitButton>Salvar contato</SubmitButton>
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function EventForm({ contactId }: { contactId: string }) {
  return (
    <ActionForm action={addContactEventAction.bind(null, contactId)} resetOnSuccess hideSuccess className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <SelectField name="type" label="Tipo" defaultValue="note">
          {MANUAL_EVENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {EVENT_TYPE_LABELS[type]}
            </option>
          ))}
        </SelectField>
        <TextAreaField name="body" label="Descrição" rows={2} required maxLength={4000} />
      </div>
      <div className="flex justify-end">
        <SubmitButton size="sm">Registrar interação</SubmitButton>
      </div>
    </ActionForm>
  );
}
