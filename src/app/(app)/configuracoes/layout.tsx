import type { ReactNode } from "react";
import { SettingsNav, type SettingsNavId } from "@/components/layout/settings-nav";
import { PageHeader } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

export default async function ConfiguracoesLayout({ children }: { children: ReactNode }) {
  const { membership } = await requireMembership();
  const role = membership.role;

  // Só ids serializáveis vão para o cliente; ícones e textos ficam no componente.
  const allowed: SettingsNavId[] = ["empresa", "perfil", "usuarios", "equipes"];
  if (can(role, "channels.manage")) allowed.push("canais");
  if (can(role, "automations.manage")) allowed.push("modelos");
  if (can(role, "settings.crm")) allowed.push("etiquetas", "funil");
  allowed.push("permissoes");

  return (
    <>
      <PageHeader title="Configurações" description="Dados da agência, equipe, canais e preferências do sistema." />
      <div className="lg:flex lg:items-stretch lg:gap-8">
        <SettingsNav allowed={allowed} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  );
}
