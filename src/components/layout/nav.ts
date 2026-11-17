import {
  BarChart3,
  ClipboardList,
  Kanban,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  MessagesSquare,
  Plane,
  Settings,
  Ticket,
  Users,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { Capability } from "@/lib/permissions";

/**
 * Mapa de navegação da área da agência. Regra: só entram itens que já
 * existem. Funcionalidades das próximas fases são acrescentadas aqui quando
 * forem entregues (nada de itens "em breve").
 */

export type NavLeaf = {
  href: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  requires?: Capability;
  /** Caminhos filhos que pertencem a outro item (ex.: /viagens/reservas não ativa Pacotes). */
  exclude?: string[];
};

export type NavItem = NavLeaf & {
  /** Subitens mostrados em menu suspenso no desktop e agrupados no celular. */
  children?: NavLeaf[];
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/atendimentos", label: "Atendimentos", icon: MessagesSquare },
  {
    href: "/contatos",
    label: "CRM",
    icon: UsersRound,
    children: [
      { href: "/contatos", label: "Contatos", description: "Clientes, leads e histórico", icon: Users },
      { href: "/funil", label: "Funil de vendas", description: "Quadro das oportunidades por etapa", icon: Kanban },
      { href: "/oportunidades", label: "Oportunidades", description: "Lista com filtros e histórico", icon: ClipboardList },
      { href: "/tarefas", label: "Tarefas", description: "Próximos passos da equipe", icon: ListChecks },
    ],
  },
  {
    href: "/viagens",
    label: "Viagens",
    icon: Plane,
    children: [
      { href: "/viagens", label: "Pacotes", description: "Catálogo e saídas", icon: Plane, exclude: ["/viagens/reservas"] },
      { href: "/viagens/reservas", label: "Reservas", description: "Vendas confirmadas e pagamentos", icon: Ticket },
    ],
  },
  { href: "/campanhas", label: "Campanhas", icon: Megaphone },
  { href: "/automacoes", label: "Automações", icon: Workflow },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, requires: "reports.view" },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

export function isLeafActive(leaf: NavLeaf, pathname: string): boolean {
  const under = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return under(leaf.href) && !leaf.exclude?.some(under);
}

export function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.children) return item.children.some((child) => isLeafActive(child, pathname));
  return isLeafActive(item, pathname);
}

/** Remove itens e subitens que o papel não acessa (decidido no servidor). */
export function visibleNav(can: (capability: Capability) => boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.requires || can(item.requires))
    .map((item) => (item.children ? { ...item, children: item.children.filter((c) => !c.requires || can(c.requires)) } : item))
    .filter((item) => !item.children || item.children.length > 0);
}
