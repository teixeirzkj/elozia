"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { moveStageAction } from "../actions";

export function StageOrderButtons({ stageId, name, first, last }: { stageId: string; name: string; first: boolean; last: boolean }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const move = (direction: "up" | "down") =>
    startTransition(async () => {
      const result = await moveStageAction(stageId, direction);
      if (!result.ok) toast.error(result.error ?? "Não foi possível reordenar.");
    });
  return (
    <>
      <Button variant="ghost" size="icon" disabled={first || pending} onClick={() => move("up")} aria-label={`Mover ${name} para cima`}>
        <ArrowUp className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon" disabled={last || pending} onClick={() => move("down")} aria-label={`Mover ${name} para baixo`}>
        <ArrowDown className="h-4 w-4" aria-hidden="true" />
      </Button>
    </>
  );
}
