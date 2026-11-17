"use client";

import { useEffect } from "react";
import { Button, LinkButton } from "@/components/ui/button";
import { AuthHeading } from "./_components/auth-ui";

/** Erro inesperado nas telas de autenticação, mantendo a moldura do layout. */
export default function AuthError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[auth]", error.digest ?? error.message);
  }, [error]);

  return (
    <div role="alert">
      <AuthHeading title="Não foi possível carregar esta página">
        Ocorreu um erro inesperado. Tente novamente; se o problema continuar, informe o suporte
        {error.digest ? ` com o código ${error.digest}` : ""}.
      </AuthHeading>
      <div className="space-y-3">
        <Button onClick={reset} className="min-h-touch w-full">
          Tentar novamente
        </Button>
        <LinkButton href="/entrar" variant="ghost" className="min-h-touch w-full">
          Ir para o login
        </LinkButton>
      </div>
    </div>
  );
}
