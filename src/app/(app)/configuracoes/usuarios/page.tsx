import { MailPlus } from "lucide-react";
import type { Metadata } from "next";
import { DataList, type DataColumn } from "@/components/ui/data-list";
import { ConfirmButton } from "@/components/ui/dialog";
import { Avatar, Badge, Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { assignableRoles, can, ROLE_LABELS } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { revokeInvitationAction } from "@/modules/settings/actions";
import { InviteDialog, MemberDialog } from "@/modules/settings/components/team-dialogs";
import { listMembers, listPendingInvitations, type InvitationRow, type MemberRow } from "@/modules/settings/queries";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsuariosPage() {
  const { supabase, membership, user } = await requireMembership();
  const orgId = membership.organization.id;
  const canManage = can(membership.role, "team.manage");
  const roles = assignableRoles(membership.role);

  const [members, invitations] = await Promise.all([
    listMembers(supabase, orgId),
    canManage ? listPendingInvitations(supabase, orgId) : Promise.resolve<InvitationRow[]>([]),
  ]);
  const activeCount = members.filter((m) => m.status === "active").length;
  const now = new Date();

  const isEditable = (m: MemberRow) =>
    canManage && m.user_id !== user.id && m.role !== "owner" && (membership.role === "owner" || m.role !== "admin");

  const memberColumns: DataColumn<MemberRow>[] = [
    {
      key: "name",
      header: "Nome",
      primary: true,
      cell: (m) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={m.full_name} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-fg">
              {m.full_name}
              {m.user_id === user.id ? <span className="font-normal text-fg-subtle"> (você)</span> : null}
            </p>
            <p className="truncate text-label font-normal text-fg-subtle">{m.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Papel",
      cell: (m) => <Badge tone={m.role === "owner" ? "brand" : "neutral"}>{ROLE_LABELS[m.role]}</Badge>,
    },
    {
      key: "status",
      header: "Situação",
      cell: (m) => (m.status === "active" ? <Badge tone="brand">Ativo</Badge> : <Badge tone="warning">Desativado</Badge>),
    },
    {
      key: "since",
      header: "Desde",
      className: "whitespace-nowrap text-fg-muted",
      cell: (m) => formatDate(m.created_at),
    },
  ];
  if (canManage && members.some(isEditable)) {
    memberColumns.push({
      key: "actions",
      header: "Ações",
      actions: true,
      align: "end",
      cell: (m) => (isEditable(m) ? <MemberDialog member={m} roles={roles} /> : null),
    });
  }

  const invitationColumns: DataColumn<InvitationRow>[] = [
    { key: "email", header: "E-mail", primary: true, cell: (inv) => <span className="break-all font-medium">{inv.email}</span> },
    { key: "role", header: "Papel", cell: (inv) => ROLE_LABELS[inv.role] },
    {
      key: "expires",
      header: "Expira em",
      className: "whitespace-nowrap text-fg-muted",
      cell: (inv) => (new Date(inv.expires_at) < now ? <Badge tone="warning">Expirado</Badge> : formatDate(inv.expires_at)),
    },
    {
      key: "actions",
      header: "Ações",
      actions: true,
      align: "end",
      cell: (inv) => (
        <ConfirmButton
          label="Cancelar convite"
          ariaLabel={`Cancelar convite de ${inv.email}`}
          className="max-md:min-h-touch"
          title="Cancelar convite"
          description={`O link enviado para ${inv.email} deixará de funcionar.`}
          confirmLabel="Cancelar convite"
          action={revokeInvitationAction.bind(null, inv.id)}
        />
      ),
    },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <Card className="overflow-hidden">
        <CardHeader
          title="Colaboradores"
          description={`${members.length} ${members.length === 1 ? "pessoa" : "pessoas"} na agência, ${activeCount} ${activeCount === 1 ? "ativa" : "ativas"}.`}
          action={canManage ? <InviteDialog roles={roles} /> : null}
        />
        <DataList columns={memberColumns} rows={members} getKey={(m) => m.id} caption="Colaboradores da agência" />
      </Card>

      {canManage ? (
        <Card className="overflow-hidden">
          <CardHeader
            title="Convites pendentes"
            description="Cada convite vale por 7 dias e só pode ser aceito pelo e-mail convidado."
          />
          {invitations.length === 0 ? (
            <EmptyState
              icon={MailPlus}
              title="Nenhum convite pendente"
              description="Use Convidar para que cada colaborador tenha acesso próprio ao sistema."
              className="py-10"
            />
          ) : (
            <DataList columns={invitationColumns} rows={invitations} getKey={(inv) => inv.id} caption="Convites pendentes" />
          )}
        </Card>
      ) : null}
    </div>
  );
}
