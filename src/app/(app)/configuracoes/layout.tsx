import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/primitives";
import { NavTabs, type TabItem } from "@/components/ui/tabs";
import { requireMembership } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

export default async function ConfiguracoesLayout({ children }: { children: ReactNode }) {
  const { membership } = await requireMembership();
  const role = membership.role;

  const tabs: TabItem[] = [
    { href: "/configuracoes", label: "Agência", exact: true },
    { href: "/configuracoes/perfil", label: "Meu perfil" },
    { href: "/configuracoes/equipe", label: "Equipe" },
    { href: "/configuracoes/permissoes", label: "Permissões" },
  ];
  if (can(role, "settings.crm")) {
    tabs.push({ href: "/configuracoes/funil", label: "Funil" }, { href: "/configuracoes/etiquetas", label: "Etiquetas" });
  }
  if (can(role, "channels.manage")) tabs.push({ href: "/configuracoes/canais", label: "Canais" });

  return (
    <>
      <PageHeader title="Configurações" description="Dados da agência, equipe e preferências do sistema." />
      <NavTabs items={tabs} label="Seções das configurações" />
      {children}
    </>
  );
}
