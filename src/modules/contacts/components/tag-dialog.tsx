"use client";

import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogButton } from "@/components/ui/dialog";
import { ActionForm, Field, SubmitButton, TextField } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import type { Tag } from "@/modules/crm/types";
import { saveTagAction } from "../actions";

export function TagDialog({ tag }: { tag?: Tag }) {
  const toast = useToast();
  return (
    <DialogButton
      label={tag ? undefined : "Nova etiqueta"}
      icon={tag ? <Pencil className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
      ariaLabel={tag ? `Editar etiqueta ${tag.name}` : undefined}
      variant={tag ? "ghost" : "primary"}
      buttonSize={tag ? "icon" : "md"}
      title={tag ? "Editar etiqueta" : "Nova etiqueta"}
      size="sm"
    >
      {(close) => (
        <ActionForm
          action={saveTagAction.bind(null, tag?.id ?? null)}
          hideSuccess
          onSuccess={(state) => {
            toast.success(state.message ?? "Etiqueta salva.");
            close();
          }}
        >
          <TextField name="name" label="Nome" defaultValue={tag?.name ?? ""} required maxLength={40} />
          <Field name="color" label="Cor">
            {(field) => <input {...field} type="color" defaultValue={tag?.color ?? "#00a857"} className="h-10 w-16 cursor-pointer rounded-md border border-line-strong bg-surface p-1" />}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancelar
            </Button>
            <SubmitButton>Salvar</SubmitButton>
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}
