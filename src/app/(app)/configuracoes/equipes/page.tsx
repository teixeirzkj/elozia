import { Trash2, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import { DataList, type DataColumn } from "@/components/ui/data-list";
import { ConfirmButton } from "@/components/ui/dialog";
import { Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { deleteTeamAction } from "@/modules/settings/actions";
import { TeamDialog } from "@/modules/settings/components/team-dialogs";
import { listMembers, listTeams, type TeamRow } from "@/modules/settings/queries";

export const metadata: Metadata = { title: "Equipes" };

export default async function EquipesPage() {
  const { supabase, membership } = await requireMembership();
  const orgId = membership.organization.id;
  const canTeams = can(membership.role, "settings.crm");

  const [members, teams] = await Promise.all([listMembers(supabase, orgId), listTeams(supabase, orgId)]);
  const activeMembers = members.filter((m) => m.status === "active").map((m) => ({ id: m.user_id, name: m.full_name }));
  const nameById = new Map(members.map((m) => [m.user_id, m.full_name]));

  const columns: DataColumn<TeamRow>[] = [
    { key: "name", header: "Equipe", primary: true, cell: (team) => <span className="font-semibold">{team.name}</span> },
    {
      key: "count",
      header: "Participantes",
      className: "whitespace-nowrap",
      cell: (team) => `${team.member_ids.length} ${team.member_ids.length === 1 ? "pessoa" : "pessoas"}`,
    },
    {
      key: "members",
      header: "Quem participa",
      className: "text-fg-muted",
      cell: (team) => {
        const names = team.member_ids.map((id) => nameById.get(id)).filter((name): name is string => Boolean(name));
        return names.length === 0 ? "Sem participantes" : names.join(", ");
      },
    },
  ];
  if (canTeams) {
    columns.push({
      key: "actions",
      header: "Ações",
      actions: true,
      align: "end",
      cell: (team) => (
        <div className="flex justify-end gap-1">
          <TeamDialog members={activeMembers} team={team} />
          <ConfirmButton
            icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
            ariaLabel={`Excluir equipe ${team.name}`}
            buttonSize="icon"
            variant="ghost"
            className="max-md:h-touch max-md:w-touch"
            title="Excluir equipe"
            description={`A equipe ${team.name} será excluída. As conversas atribuídas a ela ficam sem equipe.`}
            confirmLabel="Excluir"
            action={deleteTeamAction.bind(null, team.id)}
          />
        </div>
      ),
    });
  }

  return (
    <Card className="max-w-4xl overflow-hidden">
      <CardHeader
        title="Equipes de atendimento"
        description={
          teams.length === 0
            ? "Grupos de colaboradores para distribuir e transferir conversas."
            : `${teams.length} ${teams.length === 1 ? "equipe" : "equipes"} para distribuir e transferir conversas.`
        }
        action={canTeams ? <TeamDialog members={activeMembers} /> : null}
      />
      {teams.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="Nenhuma equipe criada"
          description={
            canTeams
              ? "Crie equipes como Vendas ou Pós-venda para organizar o atendimento."
              : "Quem gerencia o CRM pode criar equipes como Vendas ou Pós-venda."
          }
          className="py-10"
        />
      ) : (
        <DataList columns={columns} rows={teams} getKey={(team) => team.id} caption="Equipes de atendimento" />
      )}
    </Card>
  );
}
