"use client";

import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogButton } from "@/components/ui/dialog";
import { ActionForm, Field, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { centsToInput } from "@/lib/utils";
import { ITEM_STATUS_LABELS, type Departure, type TravelPackage } from "@/modules/crm/types";
import { saveDepartureAction, savePackageAction } from "../actions";
import { CURRENCIES } from "../schemas";

function StatusOptions({ feminine = false }: { feminine?: boolean }) {
  return (
    <>
      {Object.entries(ITEM_STATUS_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {feminine ? label.replace(/o$/, "a") : label}
        </option>
      ))}
    </>
  );
}

export function PackageDialog({ pkg }: { pkg?: TravelPackage }) {
  const toast = useToast();
  return (
    <DialogButton
      label={pkg ? "Editar pacote" : "Novo pacote"}
      icon={pkg ? <Pencil className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
      variant={pkg ? "secondary" : "primary"}
      title={pkg ? "Editar pacote" : "Novo pacote"}
      size="lg"
    >
      {(close) => (
        <ActionForm
          action={savePackageAction.bind(null, pkg?.id ?? null)}
          hideSuccess
          onSuccess={(state) => {
            toast.success(state.message ?? "Pacote salvo.");
            close();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="name" label="Nome do pacote" defaultValue={pkg?.name ?? ""} required maxLength={160} />
            <TextField name="destination" label="Destino" defaultValue={pkg?.destination ?? ""} required maxLength={160} />
          </div>
          <TextAreaField name="description" label="Descrição" defaultValue={pkg?.description ?? ""} rows={4} maxLength={5000} />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              name="price"
              label="Valor por pessoa"
              defaultValue={centsToInput(pkg?.price_cents)}
              inputMode="decimal"
              placeholder="0,00"
              hint="Valor base; cada saída pode ter o seu."
            />
            <SelectField name="currency" label="Moeda" defaultValue={pkg?.currency ?? "BRL"} required>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectField>
            <SelectField name="status" label="Situação" defaultValue={pkg?.status ?? "active"} required>
              <StatusOptions />
            </SelectField>
          </div>
          <Field name="image" label="Imagem" hint="JPG, PNG ou WebP, até 4 MB. Enviar uma nova substitui a atual.">
            {(field) => (
              <input
                {...field}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="elz-field file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-label file:font-semibold"
              />
            )}
          </Field>
          <TextAreaField
            name="commercial_notes"
            label="Observações comerciais"
            defaultValue={pkg?.commercial_notes ?? ""}
            rows={3}
            maxLength={5000}
            hint="Uso interno: condições, comissões, argumentos de venda."
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancelar
            </Button>
            <SubmitButton>Salvar pacote</SubmitButton>
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function DepartureDialog({ packageId, departure }: { packageId: string; departure?: Departure }) {
  const toast = useToast();
  return (
    <DialogButton
      label={departure ? undefined : "Nova saída"}
      icon={departure ? <Pencil className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
      ariaLabel={departure ? "Editar saída" : undefined}
      variant={departure ? "ghost" : "secondary"}
      buttonSize={departure ? "icon" : "sm"}
      title={departure ? "Editar saída" : "Nova saída"}
    >
      {(close) => (
        <ActionForm
          action={saveDepartureAction.bind(null, packageId, departure?.id ?? null)}
          hideSuccess
          onSuccess={(state) => {
            toast.success(state.message ?? "Saída salva.");
            close();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="departs_on" label="Data de saída" type="date" defaultValue={departure?.departs_on ?? ""} required />
            <TextField name="returns_on" label="Data de retorno" type="date" defaultValue={departure?.returns_on ?? ""} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="price"
              label="Valor por pessoa"
              defaultValue={centsToInput(departure?.price_cents)}
              inputMode="decimal"
              placeholder="Igual ao pacote"
            />
            <TextField
              name="seats_total"
              label="Vagas"
              type="number"
              min={0}
              defaultValue={departure?.seats_total ?? ""}
              hint="Controle interno, sem confirmação de fornecedores."
            />
          </div>
          <SelectField name="status" label="Situação" defaultValue={departure?.status ?? "active"} required>
            <StatusOptions feminine />
          </SelectField>
          <TextAreaField name="notes" label="Observações" defaultValue={departure?.notes ?? ""} rows={2} maxLength={1000} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancelar
            </Button>
            <SubmitButton>Salvar saída</SubmitButton>
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}
