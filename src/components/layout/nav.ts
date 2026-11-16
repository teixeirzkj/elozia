import {
  BarChart3,
  Kanban,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Plane,
  Settings,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/atendimentos", label: "Atendimentos", icon: MessagesSquare },
  { href: "/contatos", label: "Contatos", icon: Users },
  { href: "/funil", label: "Funil de vendas", icon: Kanban },
  { href: "/viagens", label: "Viagens", icon: Plane },
  { href: "/automacoes", label: "Automações", icon: Workflow },
  { href: "/campanhas", label: "Campanhas", icon: Megaphone },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];
