"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { acceptInvitationAction } from "../actions";

export function AcceptInvitationButton({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button
        variant="brand"
        className="min-h-touch w-full"
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptInvitationAction(token);
            if (result && !result.ok) setError(result.error ?? "Não foi possível aceitar o convite.");
          })
        }
      >
        {pending ? "Aceitando…" : "Aceitar convite"}
      </Button>
    </div>
  );
}
