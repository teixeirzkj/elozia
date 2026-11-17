"use client";

import {
  Building2,
  Columns3,
  FileText,
  MessageCircle,
  ShieldCheck,
  Tags,
  UserRound,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type SettingsNavId =
  | "empresa"
  | "perfil"
  | "usuarios"
  | "equipes"
  | "canais"
  | "modelos"
  | "etiquetas"
  | "funil"
  | "permissoes";

type Item = {
  id: SettingsNavId;
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  exact?: boolean;
};

/** Ordem e conteúdo do menu. O servidor decide só QUAIS ids aparecem (por capacidade). */
const ITEMS: Item[] = [
  { id: "empresa", href: "/configuracoes", title: "Empresa", description: "Dados da agência, fuso e demonstração", icon: Building2, exact: true },
  { id: "perfil", href: "/configuracoes/perfil", title: "Meu perfil", description: "Seus dados e sua senha", icon: UserRound },
  { id: "usuarios", href: "/configuracoes/usuarios", title: "Usuários", description: "Equipe, convites e papéis", icon: Users },
  { id: "equipes", href: "/configuracoes/equipes", title: "Equipes", description: "Grupos de atendimento", icon: UsersRound },
  { id: "canais", href: "/configuracoes/canais", title: "Canais", description: "Números de WhatsApp conectados", icon: MessageCircle },
  { id: "modelos", href: "/configuracoes/modelos", title: "Modelos de mensagem", description: "Modelos aprovados pela Meta", icon: FileText },
  { id: "etiquetas", href: "/configuracoes/etiquetas", title: "Etiquetas", description: "Classificação dos contatos", icon: Tags },
  { id: "funil", href: "/configuracoes/funil", title: "Funil", description: "Etapas do funil de vendas", icon: Columns3 },
  { id: "permissoes", href: "/configuracoes/permissoes", title: "Permissões", description: "O que cada papel pode fazer", icon: ShieldCheck },
];

function isActive(item: Item, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Menu lateral das configurações. No desktop (lg+) é uma coluna com ícone, título
 * e descrição; abaixo disso vira uma faixa horizontal rolável acima do conteúdo.
 */
export function SettingsNav({ allowed }: { allowed: SettingsNavId[] }) {
  const pathname = usePathname();
  const items = ITEMS.filter((item) => allowed.includes(item.id));
  const stripRef = useRef<HTMLUListElement>(null);

  // Na faixa horizontal, mantém o item ativo visível ao trocar de página.
  useEffect(() => {
    const active = stripRef.current?.querySelector<HTMLElement>("[aria-current='page']");
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  return (
    <>
      <nav aria-label="Seções das configurações" className="-mx-4 mb-6 border-b border-line sm:-mx-6 lg:hidden">
        <ul ref={stripRef} className="flex gap-1 overflow-x-auto px-4 pt-1 pb-2 sm:px-6">
          {items.map((item) => {
            const active = isActive(item, pathname);
            const Icon = item.icon;
            return (
              <li key={item.id} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-touch items-center gap-2 rounded-md px-3 text-label font-semibold whitespace-nowrap transition-colors",
                    active ? "bg-brand-soft text-brand-strong" : "text-fg-muted hover:bg-hover hover:text-fg",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {item.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav aria-label="Seções das configurações" className="hidden w-settings-nav shrink-0 lg:block">
        <ul className="sticky top-header space-y-1 pt-1">
          {items.map((item) => {
            const active = isActive(item, pathname);
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors",
                    active ? "bg-brand-soft" : "hover:bg-hover",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
                      active ? "bg-surface text-brand-strong" : "bg-muted text-fg-muted group-hover:text-fg",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block text-body font-semibold", active ? "text-brand-strong" : "text-fg")}>{item.title}</span>
                    <span className="block text-label text-fg-muted">{item.description}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
