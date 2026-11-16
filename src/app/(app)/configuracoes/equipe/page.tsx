import { MailPlus, Trash2, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import { ConfirmButton } from "@/components/ui/dialog";
import { Avatar, Badge, Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { assignableRoles, can, ROLE_LABELS } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { deleteTeamAction, revokeInvitationAction } from "@/modules/settings/actions";
import { InviteDialog, MemberDialog, TeamDialog } from "@/modules/settings/components/team-dialogs";
import { listMembers, listPendingInvitations, listTeams } from "@/modules/settings/queries";

export const metadata: Metadata = { title: "Equipe" };

export default async function EquipePage() {
  const { supabase, membership, user } = await requireMembership();
  const orgId = membership.organization.id;
  const canManage = can(membership.role, "team.manage");
  const canTeams = can(membership.role, "settings.crm");
  const roles = assignableRoles(membership.role);

  const [members, invitations, teams] = await Promise.all([
    listMembers(supabase, orgId),
    canManage ? listPendingInvitations(supabase, orgId) : Promise.resolve([]),
    listTeams(supabase, orgId),
  ]);
  const activeMembers = members.filter((m) => m.status === "active").map((m) => ({ id: m.user_id, name: m.full_name }));

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardHeader
          title="Colaboradores"
          description={`${members.length} ${members.length === 1 ? "pessoa" : "pessoas"} na agência.`}
          action={canManage ? <InviteDialog roles={roles} /> : null}
        />
        <div className="overflow-x-auto">
          <table className="elz-table">
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Papel</th>
                <th scope="col">Situação</th>
                <th scope="col">Desde</th>
                {canManage ? <th scope="col" className="text-right">Ações</th> : null}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const editable =
                  canManage && m.user_id !== user.id && m.role !== "owner" && (membership.role === "owner" || m.role !== "admin");
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={m.full_name} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {m.full_name}
                            {m.user_id === user.id ? <span className="font-normal text-fg-subtle"> (você)</span> : null}
                          </p>
                          <p className="truncate text-[13px] text-fg-subtle">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge tone={m.role === "owner" ? "brand" : "neutral"}>{ROLE_LABELS[m.role]}</Badge>
                    </td>
                    <td>
                      {m.status === "active" ? <Badge tone="brand">Ativo</Badge> : <Badge tone="warning">Desativado</Badge>}
                    </td>
                    <td className="whitespace-nowrap text-fg-muted">{formatDate(m.created_at)}</td>
                    {canManage ? (
                      <td className="text-right">{editable ? <MemberDialog member={m} roles={roles} /> : null}</td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
              description="Convide colaboradores para que tenham acesso próprio ao sistema."
              className="py-10"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="elz-table">
                <thead>
                  <tr>
                    <th scope="col">E-mail</th>
                    <th scope="col">Papel</th>
                    <th scope="col">Expira em</th>
                    <th scope="col" className="text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((inv) => (
                    <tr key={inv.id}>
                      <td className="font-medium">{inv.email}</td>
                      <td>{ROLE_LABELS[inv.role]}</td>
                      <td className="text-fg-muted">
                        {new Date(inv.expires_at) < new Date() ? (
                          <Badge tone="warning">Expirado</Badge>
                        ) : (
                          formatDate(inv.expires_at)
                        )}
                      </td>
                      <td className="text-right">
                        <ConfirmButton
                          label="Cancelar"
                          title="Cancelar convite"
                          description={`O link enviado para ${inv.email} deixará de funcionar.`}
                          confirmLabel="Cancelar convite"
                          action={revokeInvitationAction.bind(null, inv.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader
          title="Equipes de atendimento"
          description="Grupos de colaboradores para distribuir e transferir conversas."
          action={canTeams ? <TeamDialog members={activeMembers} /> : null}
        />
        {teams.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="Nenhuma equipe criada"
            description="Crie equipes como Vendas ou Pós-venda para organizar o atendimento."
            className="py-10"
          />
        ) : (
          <ul className="divide-y divide-line">
            {teams.map((team) => (
              <li key={team.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="font-semibold">{team.name}</p>
                  <p className="text-[13px] text-fg-muted">
                    {team.member_ids.length === 0
                      ? "Sem participantes"
                      : members
                          .filter((m) => team.member_ids.includes(m.user_id))
                          .map((m) => m.full_name)
                          .join(", ")}
                  </p>
                </div>
                {canTeams ? (
                  <div className="flex gap-2">
                    <TeamDialog members={activeMembers} team={team} />
                    <ConfirmButton
                      icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                      ariaLabel={`Excluir equipe ${team.name}`}
                      buttonSize="icon"
                      variant="ghost"
                      title="Excluir equipe"
                      description={`A equipe ${team.name} será excluída. As conversas atribuídas a ela ficam sem equipe.`}
                      confirmLabel="Excluir"
                      action={deleteTeamAction.bind(null, team.id)}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
