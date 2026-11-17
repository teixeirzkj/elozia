"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import type { ActionState } from "@/lib/action";
import { cn } from "@/lib/utils";
import { Alert } from "./alert";
import { Button } from "./button";
import { useToast } from "./toast";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
};

const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

/** Modal sobre o elemento nativo <dialog>: foco preso, Esc fecha, rótulo acessível. */
export function Dialog({ open, onClose, title, description, children, size = "md" }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const downOnBackdrop = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={onClose}
      // Só fecha pelo fundo se o toque também começou no fundo: arrastar uma
      // seleção de dentro do modal e soltar fora gera click no próprio <dialog>.
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        if (e.target === ref.current && downOnBackdrop.current) onClose();
        downOnBackdrop.current = false;
      }}
      className={cn(
        "elz-dialog m-auto rounded-xl open:flex open:flex-col border border-line bg-surface p-0 text-fg shadow-float",
        widths[size],
      )}
    >
      {open ? (
        <div className="flex min-h-0 flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-bold">
                {title}
              </h2>
              {description ? <p className="mt-0.5 text-label text-fg-muted">{description}</p> : null}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar" className="-mr-2 -mt-1">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}

/** Botão que abre um modal; o conteúdo recebe `close` para fechar após salvar. */
export function DialogButton({
  label,
  icon,
  title,
  description,
  size,
  variant = "primary",
  buttonSize = "md",
  ariaLabel,
  className,
  children,
}: {
  label?: ReactNode;
  icon?: ReactNode;
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "brand" | "secondary" | "ghost" | "danger";
  buttonSize?: "sm" | "md" | "icon";
  ariaLabel?: string;
  className?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={buttonSize} onClick={() => setOpen(true)} aria-label={ariaLabel} className={className}>
        {icon}
        {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} description={description} size={size}>
        {children(() => setOpen(false))}
      </Dialog>
    </>
  );
}

/**
 * Botão com confirmação para ações destrutivas ou irreversíveis.
 * `action` é uma Server Action já vinculada aos seus argumentos.
 */
export function ConfirmButton({
  label,
  icon,
  title,
  description,
  confirmLabel = "Confirmar",
  action,
  variant = "secondary",
  buttonSize = "sm",
  danger = true,
  ariaLabel,
  onDone,
  className,
}: {
  label?: ReactNode;
  icon?: ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  action: () => Promise<ActionState>;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  buttonSize?: "sm" | "md" | "icon";
  danger?: boolean;
  ariaLabel?: string;
  onDone?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setOpen(false);
        if (result.message) toast.success(result.message);
        onDone?.();
      } else {
        setError(result.error ?? "Não foi possível concluir a operação.");
      }
    });
  }

  return (
    <>
      <Button
        variant={variant}
        size={buttonSize}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        aria-label={ariaLabel}
        className={className}
      >
        {icon}
        {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} size="sm">
        <p className="text-sm text-fg-muted">{description}</p>
        {error ? (
          <Alert tone="danger" className="mt-3">
            {error}
          </Alert>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={confirm} disabled={pending} aria-busy={pending}>
            {pending ? "Aguarde…" : confirmLabel}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
