"use client";

import { ArrowRightLeft, Check, Hand, RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DialogButton } from "@/components/ui/dialog";
import { ActionForm, SelectField, SubmitButton } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import type { ActionState } from "@/lib/action";
import type { Option } from "@/modules/crm/types";
import { assumeConversationAction, closeConversationAction, reopenConversationAction, startConversationAction, transferConversationAction } from "../actions";
import type { ConversationStatus } from "../queries";

function ActionButton({ action, label, icon, variant = "secondary" }: { action: () => Promise<ActionState>; label: string; icon: React.ReactNode; variant?: "secondary" | "brand" | "primary" }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <Button
      variant={variant}
      size="sm"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await action();
          if (result?.ok) {
            if (result.message) toast.success(result.message);
          } else if (result) {
            toast.error(result.error ?? "Não foi possível concluir.");
          }
        })
      }
    >
      {icon}
      {label}
    </Button>
  );
}

export function ConversationActions({
  conversationId,
  status,
  assigneeId,
  currentUserId,
  canHandle,
  members,
  teams,
}: {
  conversationId: string;
  status: ConversationStatus;
  assigneeId: string | null;
  currentUserId: string;
  /** Responsável, gestor ou conversa sem responsável. */
  canHandle: boolean;
  members: Option[];
  teams: Option[];
}) {
  const toast = useToast();
  const [target, setTarget] = useState<"assignee" | "team">("assignee");

  if (status === "closed") {
    return <ActionButton action={reopenConversationAction.bind(null, conversationId)} label="Reabrir" icon={<RotateCcw className="h-4 w-4" aria-hidden="true" />} />;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {assigneeId !== currentUserId && canHandle ? (
        <ActionButton
          action={assumeConversationAction.bind(null, conversationId)}
          label="Assumir"
          variant="brand"
          icon={<Hand className="h-4 w-4" aria-hidden="true" />}
        />
      ) : null}
      {canHandle ? (
        <>
          <DialogButton
            label="Transferir"
            icon={<ArrowRightLeft className="h-4 w-4" aria-hidden="true" />}
            variant="secondary"
            buttonSize="sm"
            title="Transferir atendimento"
            size="sm"
          >
            {(close) => (
              <ActionForm
                action={transferConversationAction.bind(null, conversationId)}
                hideSuccess
                onSuccess={(state) => {
                  toast.success(state.message ?? "Atendimento transferido.");
                  close();
                }}
              >
                <fieldset className="flex gap-4 text-sm">
                  <legend className="sr-only">Destino</legend>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="radio" checked={target === "assignee"} onChange={() => setTarget("assignee")} className="accent-[var(--elz-green-strong)]" />
                    Atendente
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="radio" checked={target === "team"} onChange={() => setTarget("team")} disabled={teams.length === 0} className="accent-[var(--elz-green-strong)]" />
                    Equipe
                  </label>
                </fieldset>
                {target === "assignee" ? (
                  <SelectField name="assignee_id" label="Atendente" required defaultValue="">
                    <option value="" disabled>
                      Selecione
                    </option>
                    {members
                      .filter((m) => m.id !== assigneeId)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </SelectField>
                ) : (
                  <SelectField
                    name="team_id"
                    label="Equipe"
                    required
                    defaultValue=""
                    hint="A conversa volta para Pendentes até alguém da equipe assumir."
                  >
                    <option value="" disabled>
                      Selecione
                    </option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </SelectField>
                )}
                {teams.length === 0 ? <p className="text-xs text-fg-subtle">Nenhuma equipe criada. Crie equipes em Configurações › Equipe.</p> : null}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={close}>
                    Cancelar
                  </Button>
                  <SubmitButton>Transferir</SubmitButton>
                </div>
              </ActionForm>
            )}
          </DialogButton>
          <ActionButton action={closeConversationAction.bind(null, conversationId)} label="Concluir" icon={<Check className="h-4 w-4" aria-hidden="true" />} />
        </>
      ) : null}
    </div>
  );
}

/** Usado na ficha do contato para abrir a conversa e enviar um template. */
export function StartConversationButton({ contactId, label }: { contactId: string; label: string }) {
  return <ActionButton action={startConversationAction.bind(null, contactId)} label={label} icon={null} />;
}
