"use client";

import { Pause, Play } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { setAutomationStatusAction } from "../actions";

export function AutomationToggle({ automationId, status, name }: { automationId: string; status: "active" | "paused"; name: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const next = status === "active" ? "paused" : "active";
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      aria-busy={pending}
      aria-label={`${status === "active" ? "Pausar" : "Ativar"} ${name}`}
      onClick={() =>
        startTransition(async () => {
          const result = await setAutomationStatusAction(automationId, next);
          if (result.ok) toast.success(result.message ?? "Automação atualizada.");
          else toast.error(result.error ?? "Não foi possível atualizar.");
        })
      }
    >
      {status === "active" ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
      {status === "active" ? "Pausar" : "Ativar"}
    </Button>
  );
}
