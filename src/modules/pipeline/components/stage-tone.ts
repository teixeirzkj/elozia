import type { Stage } from "@/modules/crm/types";

export type StageTone = "lead" | "progress" | "proposal" | "won" | "lost";

/**
 * Tom visual de uma etapa do funil, derivado do tipo da etapa (ganho/perda) e,
 * nas etapas em andamento, da posição: a primeira etapa aberta é a de entrada
 * (lead) e etapas cujo nome fala em proposta, orçamento ou negociação usam o tom
 * de proposta. Apenas visual: não altera nenhuma regra do funil.
 */
export function stageTone(stage: Pick<Stage, "id" | "name" | "kind">, stages: Pick<Stage, "id" | "kind" | "position">[]): StageTone {
  if (stage.kind === "won") return "won";
  if (stage.kind === "lost") return "lost";
  const firstOpen = [...stages].filter((s) => s.kind === "open").sort((a, b) => a.position - b.position)[0];
  if (firstOpen?.id === stage.id) return "lead";
  if (/propost|or[cç]amento|negocia/i.test(stage.name)) return "proposal";
  return "progress";
}

/** Classes do marcador (bolinha) e da faixa superior da coluna, por tom. */
export const stageToneDot: Record<StageTone, string> = {
  lead: "bg-status-lead",
  progress: "bg-status-progress",
  proposal: "bg-status-proposal",
  won: "bg-status-won",
  lost: "bg-status-lost",
};

export const stageToneBorder: Record<StageTone, string> = {
  lead: "border-t-status-lead",
  progress: "border-t-status-progress",
  proposal: "border-t-status-proposal",
  won: "border-t-status-won",
  lost: "border-t-status-lost",
};
