"use client";

import { Check, RotateCcw } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { toggleTaskAction } from "@/modules/contacts/actions";

/** Conclui ou reabre uma tarefa pela Server Action existente; a lista é revalidada pelo servidor. */
export function TaskToggle({ taskId, title, done }: { taskId: string; title: string; done: boolean }) {
  const [optimisticDone, setOptimisticDone] = useOptimistic(done);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function toggle() {
    const next = !optimisticDone;
    startTransition(async () => {
      setOptimisticDone(next);
      const result = await toggleTaskAction(taskId, next);
      if (result.ok) toast.success(next ? "Tarefa concluída." : "Tarefa reaberta.");
      else toast.error(result.error ?? "Não foi possível atualizar a tarefa.");
    });
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={toggle}
      disabled={pending}
      aria-label={optimisticDone ? `Reabrir: ${title}` : `Concluir: ${title}`}
      className="min-h-touch md:min-h-0"
    >
      {optimisticDone ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
      {optimisticDone ? "Reabrir" : "Concluir"}
    </Button>
  );
}
