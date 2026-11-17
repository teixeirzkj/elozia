"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";

/** Mesmo ponto de quebra do `xl` do Tailwind: a partir dele o painel fica fixo ao lado da conversa. */
const WIDE_QUERY = "(min-width: 80rem)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(WIDE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * Painel do cliente. Em telas largas (xl+) é uma coluna fixa à direita;
 * abaixo disso abre como gaveta lateral, controlada pelo parâmetro `painel`
 * da URL (a página continua sendo a fonte da verdade).
 */
export function CustomerPanel({ open, closeHref, children }: { open: boolean; closeHref: string; children: ReactNode }) {
  const router = useRouter();
  // No servidor assume a coluna larga; no celular a hidratação troca para a gaveta.
  const wide = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => true,
  );

  // Fecha na hora ao pedir, sem esperar a navegação; reabre quando a URL pedir de novo.
  const [dismissed, setDismissed] = useState(false);
  const [lastOpen, setLastOpen] = useState(open);
  if (lastOpen !== open) {
    setLastOpen(open);
    setDismissed(false);
  }

  function close() {
    setDismissed(true);
    router.push(closeHref, { scroll: false });
  }

  if (wide) {
    return (
      <aside className="hidden min-h-0 w-aside shrink-0 overflow-y-auto border-l border-line bg-surface xl:block" aria-label="Informações do cliente">
        {children}
      </aside>
    );
  }

  return (
    <Drawer open={open && !dismissed} onClose={close} title="Informações do cliente" description="Contato, responsáveis e oportunidades" size="md">
      <div className="border-b border-line px-4 py-2 md:hidden">
        <Button variant="secondary" size="sm" onClick={close} className="max-md:h-touch">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar para a conversa
        </Button>
      </div>
      {children}
    </Drawer>
  );
}
