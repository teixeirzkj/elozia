"use client";

import { Check, Copy, Pencil, Plus, UserPlus } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogButton } from "@/components/ui/dialog";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/lib/permissions";
import { inviteMemberAction, saveTeamAction, updateMemberAction } from "../actions";
import type { MemberRow, TeamRow } from "../queries";

export function InviteDialog({ roles }: { roles: Role[] }) {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{ link: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function close() {
    setOpen(false);
    setCreated(null);
    setCopied(false);
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" aria-hidden="true" />
        Convidar
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title="Convidar colaborador"
        description="A pessoa cria a própria senha ao abrir o link do convite."
      >
        {created ? (
          <div className="space-y-4">
            <Alert tone="success" title="Convite criado">
              Envie o link abaixo para {created.email}. Por segurança, ele é exibido somente agora.
            </Alert>
            <div className="flex gap-2">
              <input
                readOnly
                value={created.link}
                aria-label="Link do convite"
                className="elz-field font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button variant="secondary" onClick={copy} aria-label="Copiar link do convite">
                {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <div className="flex justify-end">
              <Button onClick={close}>Concluir</Button>
            </div>
          </div>
        ) : (
          <ActionForm
            action={inviteMemberAction}
            hideSuccess
            onSuccess={(state) => setCreated(state.data as { link: string; email: string })}
          >
            <TextField name="email" label="E-mail" type="email" inputMode="email" required />
            <SelectField name="role" label="Papel" defaultValue={roles[roles.length - 1]} required>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]} — {ROLE_DESCRIPTIONS[role]}
                </option>
              ))}
            </SelectField>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={close}>
                Cancelar
              </Button>
              <SubmitButton>Criar convite</SubmitButton>
            </div>
          </ActionForm>
        )}
      </Dialog>
    </>
  );
}

export function MemberDialog({ member, roles }: { member: MemberRow; roles: Role[] }) {
  const toast = useToast();
  return (
    <DialogButton
      label="Editar"
      variant="secondary"
      buttonSize="sm"
      ariaLabel={`Editar ${member.full_name}`}
      title={member.full_name}
      description={member.email}
    >
      {(close) => (
        <ActionForm
          action={updateMemberAction}
          hideSuccess
          onSuccess={(state) => {
            toast.success(state.message ?? "Colaborador atualizado.");
            close();
          }}
        >
          <input type="hidden" name="membership_id" value={member.id} />
          <SelectField name="role" label="Papel" defaultValue={member.role} required>
            {roles.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </SelectField>
          <SelectField
            name="status"
            label="Situação"
            defaultValue={member.status}
            hint="Ao desativar, a pessoa perde o acesso imediatamente. O histórico é preservado."
            required
          >
            <option value="active">Ativo</option>
            <option value="disabled">Desativado</option>
          </SelectField>
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

export function TeamDialog({ members, team }: { members: Array<{ id: string; name: string }>; team?: TeamRow }) {
  const toast = useToast();
  return (
    <DialogButton
      label={team ? undefined : "Nova equipe"}
      icon={team ? <Pencil className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
      variant={team ? "ghost" : "secondary"}
      buttonSize={team ? "icon" : "md"}
      ariaLabel={team ? `Editar equipe ${team.name}` : undefined}
      title={team ? "Editar equipe" : "Nova equipe"}
    >
      {(close) => (
        <ActionForm
          action={saveTeamAction.bind(null, team?.id ?? null)}
          hideSuccess
          onSuccess={(state) => {
            toast.success(state.message ?? "Equipe salva.");
            close();
          }}
        >
          <TextField name="name" label="Nome da equipe" defaultValue={team?.name ?? ""} required maxLength={80} />
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-semibold">Participantes</legend>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-line p-2">
              {members.map((m) => (
                <label key={m.id} className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    name="members"
                    value={m.id}
                    defaultChecked={team?.member_ids.includes(m.id)}
                    className="h-4 w-4 accent-[var(--elz-green-strong)]"
                  />
                  {m.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancelar
            </Button>
            <SubmitButton>Salvar equipe</SubmitButton>
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}
