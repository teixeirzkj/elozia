"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type Ctx = { close: () => void };
const MenuContext = createContext<Ctx>({ close: () => {} });

/**
 * Menu suspenso acessível (padrão "menu button"): abre por clique, Enter,
 * espaço ou setas; navega por setas, Home e End; Esc e a escolha de um item
 * fecham e devolvem o foco ao botão; Tab e clique fora apenas fecham.
 * Itens dentro de um <form> (ex.: MenuButton type="submit") pedem role="none"
 * no <form>, para a árvore de acessibilidade ficar menu > menuitem.
 */
export function DropdownMenu({
  trigger,
  triggerClassName,
  triggerLabel,
  align = "start",
  width = "w-64",
  children,
}: {
  trigger: ReactNode;
  triggerClassName?: string;
  /** Rótulo acessível quando o gatilho não tem texto. */
  triggerLabel?: string;
  align?: "start" | "end";
  width?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusLastOnOpen = useRef(false);
  const menuId = useId();

  // Fecha quando a rota muda por fora do menu (botão voltar, link da página).
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
  const focusItem = (index: number) => {
    const list = items();
    if (list.length === 0) return;
    list[(index + list.length) % list.length]?.focus();
  };

  useEffect(() => {
    if (!open) return;
    // pointerdown (e não mousedown): no Safari do iPhone um toque em área
    // sem clique não gera eventos de mouse, e o menu ficaria aberto.
    const onDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    // Foco no primeiro item ao abrir (no último, se abriu pela seta para cima).
    const frame = requestAnimationFrame(() => {
      const list = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
      (focusLastOnOpen.current ? list.at(-1) : list[0])?.focus();
      focusLastOnOpen.current = false;
    });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  function onTriggerKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      focusLastOnOpen.current = event.key === "ArrowUp";
      setOpen(true);
    }
  }

  function onMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusItem(list.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      close(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(event) => {
        // Foco levado para fora por outro meio (leitor de tela, atalho): fecha sem roubar o foco.
        const next = event.relatedTarget as Node | null;
        if (open && next && !rootRef.current?.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onTriggerKey}
        className={triggerClassName}
      >
        {trigger}
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            ref={menuRef}
            id={menuId}
            role="menu"
            onKeyDown={onMenuKey}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className={cn(
              "absolute z-40 mt-2 origin-top rounded-lg border border-line bg-surface p-1.5 text-fg shadow-float",
              align === "end" ? "right-0" : "left-0",
              width,
            )}
          >
            {/* Ao escolher um item o foco volta ao botão: sem isso ele cai no <body>
                quando o menu desmonta, e um modal aberto pelo item não tem para onde devolvê-lo. */}
            <MenuContext value={{ close: () => close(true) }}>{children}</MenuContext>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

const itemClass =
  // Foco com o anel global (recuado para dentro), distinto do hover; 44px no celular.
  "flex w-full cursor-pointer items-start gap-3 rounded-md px-3 py-2 text-left text-body text-fg transition-colors duration-100 hover:bg-hover focus-visible:bg-hover focus-visible:-outline-offset-2 max-md:min-h-touch";

export function MenuLink({
  href,
  icon,
  description,
  active,
  children,
}: {
  href: string;
  icon?: ReactNode;
  description?: string;
  active?: boolean;
  children: ReactNode;
}) {
  const { close } = useContext(MenuContext);
  return (
    <Link
      href={href}
      role="menuitem"
      tabIndex={-1}
      aria-current={active ? "page" : undefined}
      onClick={close}
      className={cn(itemClass, active && "bg-green-50")}
    >
      {icon ? <span className={cn("mt-0.5 shrink-0", active ? "text-green-700" : "text-fg-subtle")}>{icon}</span> : null}
      <span className="min-w-0">
        <span className={cn("block font-semibold", active && "text-green-800")}>{children}</span>
        {description ? <span className="mt-0.5 block text-label text-fg-subtle">{description}</span> : null}
      </span>
    </Link>
  );
}

export function MenuButton({
  onSelect,
  icon,
  danger,
  type = "button",
  children,
}: {
  onSelect?: () => void;
  icon?: ReactNode;
  danger?: boolean;
  type?: "button" | "submit";
  children: ReactNode;
}) {
  const { close } = useContext(MenuContext);
  return (
    <button
      type={type}
      role="menuitem"
      tabIndex={-1}
      onClick={() => {
        onSelect?.();
        if (type === "button") close();
      }}
      className={cn(itemClass, "items-center", danger && "text-danger hover:bg-danger-soft focus-visible:bg-danger-soft")}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1.5 h-px bg-line" />;
}

export function MenuHeader({ children }: { children: ReactNode }) {
  return <div className="px-3 pt-1.5 pb-2 text-label text-fg-subtle">{children}</div>;
}
