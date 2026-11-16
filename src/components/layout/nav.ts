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
import type { Capability } from "@/lib/permissions";

export type NavItem = { href: string; label: string; icon: LucideIcon; requires?: Capability };

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/atendimentos", label: "Atendimentos", icon: MessagesSquare },
  { href: "/contatos", label: "Contatos", icon: Users },
  { href: "/funil", label: "Funil de vendas", icon: Kanban },
  { href: "/viagens", label: "Viagens", icon: Plane },
  { href: "/automacoes", label: "Automações", icon: Workflow },
  { href: "/campanhas", label: "Campanhas", icon: Megaphone },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, requires: "reports.view" },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];
