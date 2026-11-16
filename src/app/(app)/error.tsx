"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ui]", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="p-4">
      <EmptyState
        icon={TriangleAlert}
        title="Não foi possível carregar esta página"
        description={`Ocorreu um erro inesperado. Tente novamente; se o problema continuar, informe o suporte${error.digest ? ` com o código ${error.digest}` : ""}.`}
        action={<Button onClick={reset}>Tentar novamente</Button>}
      />
    </div>
  );
}
