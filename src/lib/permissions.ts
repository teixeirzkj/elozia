/**
 * Papéis e capacidades. Fonte única usada pelo servidor; as políticas de RLS em
 * supabase/migrations espelham estas regras no banco.
 */

export const ROLES = ["owner", "admin", "supervisor", "agent"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  supervisor: "Supervisor",
  agent: "Atendente",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Acesso total. Gerencia administradores e os dados da agência.",
  admin: "Gerencia equipe, canais e configurações da agência.",
  supervisor: "Gerencia funil, catálogo, automações, campanhas e relatórios.",
  agent: "Atende conversas e trabalha contatos, oportunidades e reservas.",
};

export const CAPABILITIES = {
  "organization.manage": { label: "Editar dados e fuso da agência", roles: ["owner", "admin"] },
  "team.manage": { label: "Convidar e gerenciar colaboradores", roles: ["owner", "admin"] },
  "channels.manage": { label: "Conectar canais de WhatsApp", roles: ["owner", "admin"] },
  "settings.crm": { label: "Configurar funil, etiquetas e equipes", roles: ["owner", "admin", "supervisor"] },
  "catalog.manage": { label: "Criar e editar viagens", roles: ["owner", "admin", "supervisor"] },
  "automations.manage": { label: "Criar automações e campanhas", roles: ["owner", "admin", "supervisor"] },
  "crm.write": { label: "Criar e editar contatos, oportunidades e reservas", roles: ["owner", "admin", "supervisor", "agent"] },
  "crm.delete": { label: "Excluir contatos e oportunidades", roles: ["owner", "admin", "supervisor"] },
  "crm.import": { label: "Importar contatos por CSV", roles: ["owner", "admin", "supervisor"] },
  "inbox.attend": { label: "Atender conversas", roles: ["owner", "admin", "supervisor", "agent"] },
  "inbox.manage": { label: "Transferir conversas de outros atendentes", roles: ["owner", "admin", "supervisor"] },
  "reports.view": { label: "Ver relatórios e exportar CSV", roles: ["owner", "admin", "supervisor"] },
} as const satisfies Record<string, { label: string; roles: readonly Role[] }>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: Role, capability: Capability): boolean {
  return (CAPABILITIES[capability].roles as readonly Role[]).includes(role);
}

/** Papéis que `actor` pode atribuir a outra pessoa. */
export function assignableRoles(actor: Role): Role[] {
  if (actor === "owner") return ["admin", "supervisor", "agent"];
  if (actor === "admin") return ["supervisor", "agent"];
  return [];
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
