"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/**
 * Painel lateral sobre o elemento nativo <dialog>: foco preso, Esc fecha,
 * fundo escurecido, entrada e saída deslizando. Usado para detalhes de
 * registros e para a navegação no celular.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  side = "right",
  size = "md",
  footer,
  hideHeader = false,
  tone = "light",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  side?: "left" | "right";
  size?: "sm" | "md" | "lg";
  footer?: ReactNode;
  /** Oculta o cabeçalho visual (o título continua acessível). */
  hideHeader?: boolean;
  tone?: "light" | "dark";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // `shown`: o conteúdo continua montado até o <dialog> fechar de fato. Derivar
  // `closing` no render (e não num efeito) evita um quadro com o painel vazio
  // e o foco caindo no <body> logo que `open` vira false. Reaberto durante a
  // saída, `closing` volta a false sozinho (o cleanup descarta o timer).
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  const closing = shown && !open;
  // Clique no fundo só fecha se o toque também COMEÇOU no fundo: arrastar uma
  // seleção de texto de dentro do painel e soltar fora gera click no <dialog>.
  const downOnBackdrop = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
      document.documentElement.style.overflow = "hidden";
      return;
    }
    if (el.open) {
      // Anima a saída antes de fechar de fato.
      const timer = setTimeout(() => {
        el.close();
        setShown(false);
      }, 180);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const restore = () => {
      document.documentElement.style.overflow = "";
    };
    el.addEventListener("close", restore);
    return () => {
      el.removeEventListener("close", restore);
      restore();
    };
  }, []);

  const closeButton = (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClose}
      aria-label="Fechar"
      className={cn(
        hideHeader ? "absolute top-1.5 right-2 z-10 md:top-2.5" : "-mt-1 -mr-2",
        tone === "dark" && "text-topbar-fg hover:bg-topbar-hover hover:text-topbar-fg-strong",
      )}
    >
      <X className="h-4 w-4" aria-hidden="true" />
    </Button>
  );

  const widths = { sm: "w-80", md: "w-drawer", lg: "w-drawer-lg" };
  const enter = side === "right" ? "elz-drawer-right" : "elz-drawer-left";

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        downOnBackdrop.current = event.target === ref.current;
      }}
      onClick={(event) => {
        if (event.target === ref.current && downOnBackdrop.current) onClose();
        downOnBackdrop.current = false;
      }}
      onClose={() => {
        setShown(false);
        // Fechado pelo navegador sem passar por `onCancel` (ex.: Esc sem
        // ativação do usuário no Chrome): sincroniza o estado do pai.
        if (open) onClose();
      }}
      data-closing={closing || undefined}
      className={cn(
        "elz-drawer m-0 h-dvh max-h-dvh max-w-screen p-0",
        side === "right" ? "ml-auto" : "mr-auto",
        widths[size],
        enter,
        tone === "dark" ? "bg-topbar text-topbar-fg-strong" : "bg-surface text-fg",
      )}
    >
      {shown ? (
        <div className="relative flex h-full flex-col">
          <div
            className={cn(
              "flex items-start justify-between gap-4 border-b px-5 py-4",
              tone === "dark" ? "border-topbar-line" : "border-line",
              hideHeader && "sr-only",
            )}
          >
            <div className="min-w-0">
              <h2 id={titleId} className="text-title font-bold">
                {title}
              </h2>
              {description ? <p className="mt-0.5 text-label text-fg-muted">{description}</p> : null}
            </div>
            {hideHeader ? null : closeButton}
          </div>
          {/* Com o cabeçalho oculto o botão continua VISÍVEL: ele recebe o foco
              inicial do showModal, e um foco dentro de .sr-only some da tela. */}
          {hideHeader ? closeButton : null}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer ? <div className="border-t border-line px-5 py-3">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}
