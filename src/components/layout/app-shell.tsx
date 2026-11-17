"use client";

import { ChevronDown, LogOut, Menu, UserRound } from "lucide-react";
import { motion } from "motion/react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Drawer } from "@/components/ui/drawer";
import { DropdownMenu, MenuButton, MenuHeader, MenuLink, MenuSeparator } from "@/components/ui/dropdown-menu";
import { Avatar } from "@/components/ui/primitives";
import type { Capability } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { isItemActive, isLeafActive, visibleNav, type NavItem } from "./nav";

type ShellProps = {
  agencyName: string;
  userName: string;
  userEmail: string;
  roleLabel: string;
  signOut: () => Promise<void>;
  /** Capacidades do usuário, calculadas no servidor; definem os itens visíveis. */
  capabilities: Capability[];
  children: ReactNode;
};

/** Ponto discreto que pulsa enquanto a navegação do link está pendente. */
function PendingHint() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-brand transition-opacity duration-150",
        pending ? "animate-pulse opacity-100" : "opacity-0",
      )}
    />
  );
}

const topItemClass =
  "relative inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-2 text-label font-semibold transition-colors duration-150 xl:gap-2 xl:px-3";

function ActiveBar() {
  return (
    <motion.span
      layoutId="elz-topbar-active"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-2 -bottom-2.5 h-0.5 rounded-full bg-brand xl:inset-x-3"
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
    />
  );
}

function TopNav({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <nav aria-label="Navegação principal" className="hidden min-w-0 flex-1 items-center gap-0.5 lg:flex">
      {items.map((item) => {
        const active = isItemActive(item, pathname);
        const Icon = item.icon;
        const tone = active ? "bg-topbar-active text-topbar-fg-strong" : "text-topbar-fg hover:bg-topbar-hover hover:text-topbar-fg-strong";
        if (item.children) {
          return (
            <div key={item.label} className="relative">
              <DropdownMenu
                trigger={
                  <>
                    <Icon className="hidden h-4 w-4 2xl:block" aria-hidden="true" />
                    {item.label}
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
                  </>
                }
                triggerClassName={cn(topItemClass, tone)}
              >
                {item.children.map((child) => {
                  const ChildIcon = child.icon;
                  return (
                    <MenuLink
                      key={child.href}
                      href={child.href}
                      icon={<ChildIcon className="h-4 w-4" aria-hidden="true" />}
                      description={child.description}
                      active={isLeafActive(child, pathname)}
                    >
                      {child.label}
                    </MenuLink>
                  );
                })}
              </DropdownMenu>
              {active ? <ActiveBar /> : null}
            </div>
          );
        }
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn(topItemClass, tone)}>
            <Icon className="hidden h-4 w-4 2xl:block" aria-hidden="true" />
            {item.label}
            <PendingHint />
            {active ? <ActiveBar /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

const mobileLinkClass = "flex min-h-touch items-center gap-3 rounded-md px-3 text-body font-medium transition-colors";

function MobileNav({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate: () => void }) {
  return (
    <nav aria-label="Navegação principal" className="space-y-1 px-3 py-4">
      {items.map((item) => {
        const Icon = item.icon;
        if (item.children) {
          return (
            <div key={item.label} className="pt-2">
              <p className="flex items-center gap-2 px-3 pb-1 text-caption font-bold tracking-wide text-topbar-fg uppercase">
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {item.label}
              </p>
              {item.children.map((child) => {
                const ChildIcon = child.icon;
                const active = isLeafActive(child, pathname);
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(mobileLinkClass, active ? "bg-brand text-ink" : "text-topbar-fg hover:bg-topbar-hover hover:text-topbar-fg-strong")}
                  >
                    <ChildIcon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
                    {child.label}
                  </Link>
                );
              })}
            </div>
          );
        }
        const active = isItemActive(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(mobileLinkClass, active ? "bg-brand text-ink" : "text-topbar-fg hover:bg-topbar-hover hover:text-topbar-fg-strong")}
          >
            <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ProfileMenu({ userName, userEmail, roleLabel, agencyName, signOut }: Omit<ShellProps, "children" | "capabilities">) {
  return (
    <DropdownMenu
      align="end"
      width="w-72"
      triggerLabel={`Menu do perfil de ${userName}`}
      triggerClassName="flex cursor-pointer items-center gap-2.5 rounded-md py-1 pr-1 pl-1 text-topbar-fg-strong transition-colors hover:bg-topbar-hover max-lg:min-h-touch max-lg:min-w-touch max-lg:justify-center sm:pr-2"
      trigger={
        <>
          <Avatar name={userName} size={30} />
          <span className="hidden min-w-0 text-left xl:block">
            <span className="block max-w-40 truncate text-label leading-tight font-semibold">{userName}</span>
            <span className="block max-w-40 truncate text-caption leading-tight text-topbar-fg">{agencyName}</span>
          </span>
          <ChevronDown className="hidden h-4 w-4 text-topbar-fg xl:block" aria-hidden="true" />
        </>
      }
    >
      <MenuHeader>
        <span className="block truncate text-body font-semibold text-fg">{userName}</span>
        <span className="block truncate">{userEmail}</span>
        <span className="mt-1 block truncate">
          {roleLabel} · {agencyName}
        </span>
      </MenuHeader>
      <MenuSeparator />
      <MenuLink href="/configuracoes/perfil" icon={<UserRound className="h-4 w-4" aria-hidden="true" />}>
        Meu perfil
      </MenuLink>
      {/* role="none": o <form> não entra entre menu e menuitem na árvore de acessibilidade. */}
      <form action={signOut} role="none">
        <MenuButton type="submit" danger icon={<LogOut className="h-4 w-4" aria-hidden="true" />}>
          Sair
        </MenuButton>
      </form>
    </DropdownMenu>
  );
}

/**
 * Estrutura da área autenticada: barra superior escura com menus suspensos
 * no desktop e gaveta lateral no celular.
 */
export function AppShell({ agencyName, userName, userEmail, roleLabel, signOut, capabilities, children }: ShellProps) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  const items = visibleNav((capability) => capabilities.includes(capability));

  // Fecha a gaveta quando a rota muda (inclusive pelo botão voltar).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (drawer) setDrawer(false);
  }

  // A central de atendimento ocupa a altura toda, sem a margem padrão.
  const fullBleed = pathname.startsWith("/atendimentos");

  return (
    <div className="min-h-dvh">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-70 focus:rounded-md focus:bg-brand focus:px-3 focus:py-2 focus:font-semibold focus:text-ink"
      >
        Pular para o conteúdo
      </a>

      <header className="sticky top-0 z-30 border-b border-topbar-line bg-topbar">
        <div className="flex h-topbar items-center gap-2 px-3 sm:px-5">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Abrir menu"
            aria-expanded={drawer}
            className="flex h-touch w-touch shrink-0 cursor-pointer items-center justify-center rounded-md text-topbar-fg-strong transition-colors hover:bg-topbar-hover lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <Link href="/dashboard" aria-label="Elozia — ir para o dashboard" className="mr-2 shrink-0 rounded-md xl:mr-4">
            <Logo onDark className="w-28" />
          </Link>
          <TopNav items={items} pathname={pathname} />
          <div className="ml-auto flex items-center">
            <ProfileMenu userName={userName} userEmail={userEmail} roleLabel={roleLabel} agencyName={agencyName} signOut={signOut} />
          </div>
        </div>
      </header>

      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Menu" side="left" size="sm" tone="dark" hideHeader>
        <div className="flex h-topbar items-center border-b border-topbar-line px-5">
          <Logo onDark className="w-28" />
        </div>
        <p className="truncate px-6 pt-4 text-label text-topbar-fg">{agencyName}</p>
        <MobileNav items={items} pathname={pathname} onNavigate={() => setDrawer(false)} />
      </Drawer>

      {/* scroll-mt-header: o salto do link "Pular para o conteúdo" não esconde o topo sob a barra fixa. */}
      <main id="conteudo" className={cn("scroll-mt-header", !fullBleed && "mx-auto w-full max-w-content px-4 py-6 sm:px-6 lg:px-8 lg:py-8")}>
        {children}
      </main>
    </div>
  );
}
