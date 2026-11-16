import { Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { ConfirmButton } from "@/components/ui/dialog";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { requireCapabilityPage } from "@/lib/auth/session";
import { STAGE_KIND_LABELS } from "@/modules/crm/types";
import { deleteStageAction } from "@/modules/pipeline/actions";
import { StageDialog } from "@/modules/pipeline/components/pipeline-dialogs";
import { StageOrderButtons } from "@/modules/pipeline/components/stage-order";
import { listStages } from "@/modules/pipeline/queries";

export const metadata: Metadata = { title: "Etapas do funil" };

const kindTone = { open: "neutral", won: "brand", lost: "danger" } as const;

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
      <ol className="divide-y divide-line">
        {stages.map((stage, index) => (
          <li key={stage.id} className="flex items-center gap-3 px-5 py-3">
            <span className="w-6 text-center text-[13px] font-semibold text-fg-subtle">{index + 1}</span>
            <p className="min-w-0 flex-1 truncate font-semibold">{stage.name}</p>
            <Badge tone={kindTone[stage.kind]}>{STAGE_KIND_LABELS[stage.kind]}</Badge>
            <div className="flex items-center gap-0.5">
              <StageOrderButtons stageId={stage.id} name={stage.name} first={index === 0} last={index === stages.length - 1} />
              <StageDialog stage={stage} />
              <ConfirmButton
                icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                ariaLabel={`Excluir etapa ${stage.name}`}
                buttonSize="icon"
                variant="ghost"
                title="Excluir etapa"
                description={`A etapa ${stage.name} será excluída do funil.`}
                confirmLabel="Excluir"
                action={deleteStageAction.bind(null, stage.id)}
              />
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
