"use client";

import { ChevronDown, LogOut, Menu, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { NAV_ITEMS } from "./nav";

type ShellProps = {
  agencyName: string;
  userName: string;
  userEmail: string;
  roleLabel: string;
  signOut: () => Promise<void>;
  /** Itens do menu que o papel do usuário não acessa. */
  hiddenNav: string[];
  children: ReactNode;
};

function NavLinks({ onNavigate, hidden }: { onNavigate?: () => void; hidden: string[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegação principal" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
      {NAV_ITEMS.filter((item) => !hidden.includes(item.href)).map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "bg-brand text-ink" : "text-sidebar-fg hover:bg-sidebar-hover hover:text-white",
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function ProfileMenu({ userName, userEmail, roleLabel, signOut }: Omit<ShellProps, "agencyName" | "children" | "hiddenNav">) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-2 rounded-md py-1 pr-1 pl-1 hover:bg-muted sm:pr-2"
      >
        <Avatar name={userName} />
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-40 truncate text-[13px] font-semibold leading-tight">{userName}</span>
          <span className="block text-xs leading-tight text-fg-subtle">{roleLabel}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-fg-subtle sm:block" aria-hidden="true" />
        <span className="sr-only">Abrir menu do perfil</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-64 rounded-lg border border-line bg-surface p-1.5 shadow-pop"
        >
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-sm font-semibold">{userName}</p>
            <p className="truncate text-xs text-fg-subtle">{userEmail}</p>
          </div>
          <Link
            href="/configuracoes/perfil"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="mt-1 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-muted"
          >
            <UserRound className="h-4 w-4" aria-hidden="true" />
            Meu perfil
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sair
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

/** Estrutura da área autenticada: sidebar fixa no desktop e gaveta no celular. */
export function AppShell({ agencyName, userName, userEmail, roleLabel, signOut, hiddenNav, children }: ShellProps) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  // A central de atendimento ocupa a altura toda, sem a margem padrão.
  const fullBleed = pathname.startsWith("/atendimentos");

  return (
    <div className="min-h-dvh lg:pl-[var(--elz-sidebar-width)]">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-white"
      >
        Pular para o conteúdo
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--elz-sidebar-width)] flex-col bg-sidebar lg:flex">
        <div className="flex h-[var(--elz-header-height)] items-center border-b border-sidebar-line px-5">
          <Link href="/dashboard" aria-label="Elozia — ir para o dashboard">
            <Logo onDark className="w-32" />
          </Link>
        </div>
        <NavLinks hidden={hiddenNav} />
      </aside>

      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-ink/50"
            onClick={() => setDrawer(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-sidebar">
            <div className="flex h-[var(--elz-header-height)] items-center justify-between border-b border-sidebar-line px-5">
              <Logo onDark className="w-32" />
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Fechar menu"
                className="cursor-pointer rounded-md p-2 text-sidebar-fg hover:bg-sidebar-hover hover:text-white"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <NavLinks hidden={hiddenNav} onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      ) : null}

      <header className="sticky top-0 z-20 flex h-[var(--elz-header-height)] items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-label="Abrir menu"
          className="-ml-2 cursor-pointer rounded-md p-2 text-fg hover:bg-muted lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <p className="min-w-0 flex-1 truncate text-[15px] font-bold" title={agencyName}>
          {agencyName}
        </p>
        <ProfileMenu userName={userName} userEmail={userEmail} roleLabel={roleLabel} signOut={signOut} />
      </header>

      <main
        id="conteudo"
        className={cn(fullBleed ? "" : "mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8")}
      >
        {children}
      </main>
    </div>
  );
}
