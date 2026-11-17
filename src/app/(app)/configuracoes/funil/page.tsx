import { Columns3, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { ConfirmButton } from "@/components/ui/dialog";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { requireCapabilityPage } from "@/lib/auth/session";
import { STAGE_KIND_LABELS } from "@/modules/crm/types";
import { deleteStageAction } from "@/modules/pipeline/actions";
import { StageDialog } from "@/modules/pipeline/components/pipeline-dialogs";
import { StageOrderButtons } from "@/modules/pipeline/components/stage-order";
import { listStages } from "@/modules/pipeline/queries";

export const metadata: Metadata = { title: "Etapas do funil" };

const kindTone = { open: "neutral", won: "won", lost: "lost" } as const;

export default async function FunilConfigPage() {
  const { supabase, membership } = await requireCapabilityPage("settings.crm");
  const stages = await listStages(supabase, membership.organization.id);

  return (
    <Card className="max-w-3xl overflow-hidden">
      <CardHeader
        title="Etapas do funil"
        description="A ordem abaixo é a ordem das colunas no quadro. Etapas com oportunidades não podem ser excluídas."
        action={<StageDialog />}
      />
      {stages.length === 0 ? (
        <EmptyState
          icon={Columns3}
          title="Nenhuma etapa criada"
          description="Crie as etapas do funil de vendas, como Novo contato, Proposta enviada e Fechado."
          className="py-10"
        />
      ) : (
        // Lista ordenada (não tabela): a posição é o próprio dado e se altera com os botões de ordem.
        <ol className="divide-y divide-line" aria-label="Etapas do funil, na ordem do quadro">
          {stages.map((stage, index) => (
            <li key={stage.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="w-6 shrink-0 text-center text-label font-semibold text-fg-subtle tabular-nums" aria-hidden="true">
                  {index + 1}
                </span>
                <p className="min-w-0 flex-1 truncate font-semibold text-fg">
                  <span className="sr-only">Etapa {index + 1}: </span>
                  {stage.name}
                </p>
                <Badge tone={kindTone[stage.kind]}>{STAGE_KIND_LABELS[stage.kind]}</Badge>
              </div>
              <div className="ml-auto flex items-center gap-0.5">
                <StageOrderButtons stageId={stage.id} name={stage.name} first={index === 0} last={index === stages.length - 1} />
                <StageDialog stage={stage} />
                <ConfirmButton
                  icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                  ariaLabel={`Excluir etapa ${stage.name}`}
                  buttonSize="icon"
                  variant="ghost"
                  className="max-md:h-touch max-md:w-touch"
                  title="Excluir etapa"
                  description={`A etapa ${stage.name} será excluída do funil.`}
                  confirmLabel="Excluir"
                  action={deleteStageAction.bind(null, stage.id)}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
