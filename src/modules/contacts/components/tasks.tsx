"use client";

import { ListTodo, Plus } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DialogButton } from "@/components/ui/dialog";
import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn, formatDateTime } from "@/lib/utils";
import type { Option, Task } from "@/modules/crm/types";
import { createTaskAction, toggleTaskAction } from "../actions";

export function TaskDialog({
  members,
  contactId,
  opportunityId,
  currentUserId,
}: {
  members: Option[];
  contactId?: string;
  opportunityId?: string;
  currentUserId: string;
}) {
  const toast = useToast();
  return (
    <DialogButton
      label="Nova tarefa"
      icon={<Plus className="h-4 w-4" aria-hidden="true" />}
      variant="secondary"
      buttonSize="sm"
      title="Nova tarefa"
    >
      {(close) => (
        <ActionForm
          action={createTaskAction}
          hideSuccess
          onSuccess={() => {
            toast.success("Tarefa criada.");
            close();
          }}
        >
          {contactId ? <input type="hidden" name="contact_id" value={contactId} /> : null}
          {opportunityId ? <input type="hidden" name="opportunity_id" value={opportunityId} /> : null}
          <TextField name="title" label="O que precisa ser feito" required maxLength={200} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="due_date" label="Data" type="date" />
            <TextField name="due_time" label="Hora" type="time" hint="No fuso da agência." />
          </div>
          <SelectField name="assignee_id" label="Responsável" defaultValue={currentUserId}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </SelectField>
          <TextAreaField name="notes" label="Detalhes" rows={2} maxLength={2000} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancelar
            </Button>
            <SubmitButton>Criar tarefa</SubmitButton>
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function TaskList({
  tasks,
  timeZone,
  showContact = false,
  emptyText = "Nenhuma tarefa registrada.",
}: {
  tasks: Task[];
  timeZone: string;
  showContact?: boolean;
  emptyText?: string;
}) {
  const [optimistic, setOptimistic] = useOptimistic(tasks, (state, change: { id: string; done: boolean }) =>
    state.map((t) => (t.id === change.id ? { ...t, done_at: change.done ? new Date().toISOString() : null } : t)),
  );
  const [, startTransition] = useTransition();
  const toast = useToast();
  const [now] = useState(() => Date.now());

  if (tasks.length === 0) {
    return <EmptyState icon={ListTodo} title="Sem tarefas" description={emptyText} className="py-8" />;
  }

  function toggle(task: Task, done: boolean) {
    startTransition(async () => {
      setOptimistic({ id: task.id, done });
      const result = await toggleTaskAction(task.id, done);
      if (!result.ok) toast.error(result.error ?? "Não foi possível atualizar a tarefa.");
    });
  }

  return (
    <ul className="divide-y divide-line">
      {optimistic.map((task) => {
        const done = task.done_at !== null;
        const overdue = !done && task.due_at !== null && new Date(task.due_at).getTime() < now;
        return (
          <li key={task.id} className="flex items-start gap-3 px-5 py-3">
            {/* No celular, a área de toque do checkbox tem 44px sem alterar o alinhamento visual. */}
            <label className="-mx-3 -my-2.5 flex min-h-touch min-w-touch shrink-0 cursor-pointer items-center justify-center sm:m-0 sm:mt-1 sm:block sm:min-h-0 sm:min-w-0">
              <input
                type="checkbox"
                checked={done}
                onChange={(e) => toggle(task, e.target.checked)}
                aria-label={`Concluir: ${task.title}`}
                className="h-4 w-4 cursor-pointer"
              />
            </label>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", done && "text-fg-subtle line-through")}>{task.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
                {task.due_at ? (
                  <span className={cn(overdue && "font-semibold text-danger")}>
                    {overdue ? "Atrasada · " : ""}
                    {formatDateTime(task.due_at, timeZone)}
                  </span>
                ) : (
                  <span>Sem prazo</span>
                )}
                {showContact && task.contact_id && task.contact_name ? (
                  <Link href={`/contatos/${task.contact_id}`} className="font-medium text-brand-strong hover:underline">
                    {task.contact_name}
                  </Link>
                ) : null}
                {task.origin === "automation" ? <Badge tone="info">Automação</Badge> : null}
              </p>
              {task.notes ? <p className="mt-1 text-label whitespace-pre-line text-fg-muted">{task.notes}</p> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
