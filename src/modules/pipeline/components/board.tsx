"use client";

import { CalendarClock, Kanban, MapPin, UserRound, Users } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState, useTransition, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate, formatDateTime, formatMoney, formatRelative } from "@/lib/utils";
import type { Opportunity, Stage } from "@/modules/crm/types";
import { moveOpportunityAction } from "../actions";
import { stageTone, stageToneBorder, stageToneDot } from "./stage-tone";

type Props = {
  stages: Stage[];
  opportunities: Opportunity[];
  timeZone: string;
  /** Usuário atual e se ele pode mover cartões de outras pessoas. */
  currentUserId: string;
  canMoveAll: boolean;
};

type PendingMove = { opportunityId: string; stageId: string; afterId: string | null };

/**
 * Quadro Kanban. Arrastar e soltar com o mouse; no teclado e no toque, cada
 * cartão tem o seletor "Mover para". A posição é persistida no servidor e, se a
 * gravação falhar, o quadro volta ao estado anterior.
 */
export function Board({ stages, opportunities, timeZone, currentUserId, canMoveAll }: Props) {
  const [items, setItems] = useState(opportunities);
  const [dragging, setDragging] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [lostPrompt, setLostPrompt] = useState<PendingMove | null>(null);
  const [lostReason, setLostReason] = useState("");
  const [, startTransition] = useTransition();
  const toast = useToast();

  // Quando o servidor envia dados novos, eles substituem o estado otimista.
  const [source, setSource] = useState(opportunities);
  if (source !== opportunities) {
    setSource(opportunities);
    setItems(opportunities);
  }

  const byStage = (stageId: string) => items.filter((o) => o.stage_id === stageId).sort((a, b) => a.position - b.position);
  const canMove = (o: Opportunity) => canMoveAll || o.owner_id === null || o.owner_id === currentUserId;

  function commit(move: PendingMove, reason: string | null) {
    const previous = items;
    const target = stages.find((s) => s.id === move.stageId);
    if (!target) return;
    // Atualização otimista: posiciona o cartão logo após `afterId`.
    setItems((list) => {
      const column = list.filter((o) => o.stage_id === move.stageId && o.id !== move.opportunityId).sort((a, b) => a.position - b.position);
      const afterIndex = move.afterId ? column.findIndex((o) => o.id === move.afterId) : -1;
      const prev = afterIndex >= 0 ? column[afterIndex]!.position : null;
      const next = column[afterIndex + 1]?.position ?? null;
      const position =
        prev === null && next === null ? 1000 : prev === null ? next! - 1000 : next === null ? prev + 1000 : (prev + next) / 2;
      return list.map((o) =>
        o.id === move.opportunityId
          ? { ...o, stage_id: move.stageId, position, status: target.kind, lost_reason: target.kind === "lost" ? reason : null }
          : o,
      );
    });
    startTransition(async () => {
      const result = await moveOpportunityAction({ ...move, lostReason: reason });
      if (!result.ok) {
        setItems(previous);
        toast.error(result.error ?? "Não foi possível mover a oportunidade.");
      }
    });
  }

  function requestMove(move: PendingMove) {
    const current = items.find((o) => o.id === move.opportunityId);
    if (!current) return;
    if (!canMove(current)) {
      toast.error("Você só pode mover oportunidades sob sua responsabilidade.");
      return;
    }
    if (current.stage_id === move.stageId && move.afterId === current.id) return;
    const target = stages.find((s) => s.id === move.stageId);
    if (target?.kind === "lost" && current.stage_id !== move.stageId) {
      setLostReason("");
      setLostPrompt(move);
      return;
    }
    commit(move, null);
  }

  function onDrop(event: DragEvent, stageId: string, beforeId: string | null) {
    event.preventDefault();
    event.stopPropagation();
    const id = event.dataTransfer.getData("text/plain") || dragging;
    setDragging(null);
    setOverStage(null);
    if (!id) return;
    const column = byStage(stageId).filter((o) => o.id !== id);
    let afterId: string | null;
    if (beforeId && beforeId !== id) {
      const index = column.findIndex((o) => o.id === beforeId);
      afterId = index > 0 ? column[index - 1]!.id : null;
    } else {
      afterId = column.at(-1)?.id ?? null;
    }
    requestMove({ opportunityId: id, stageId, afterId });
  }

  if (stages.length === 0) {
    return <EmptyState icon={Kanban} title="Funil sem etapas" description="Crie as etapas do funil em Configurações › Funil." />;
  }

  return (
    <>
      {/* relative: mantém dentro da área rolável os textos exclusivos de leitores de tela */}
      <motion.div layoutScroll className="relative -mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex min-w-max gap-3">
          {stages.map((stage) => {
            const column = byStage(stage.id);
            const total = column.reduce((sum, o) => sum + (o.currency === "BRL" ? (o.estimated_value_cents ?? 0) : 0), 0);
            const tone = stageTone(stage, stages);
            const isTarget = dragging !== null && overStage === stage.id;
            return (
              <section
                key={stage.id}
                aria-label={`Etapa ${stage.name}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overStage !== stage.id) setOverStage(stage.id);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage(null);
                }}
                onDrop={(e) => onDrop(e, stage.id, null)}
                className={cn(
                  "flex w-72 shrink-0 flex-col rounded-lg border border-t-4 transition-colors duration-150",
                  stageToneBorder[tone],
                  isTarget ? "border-x-brand-strong border-b-brand-strong bg-brand-soft" : "border-x-line border-b-line bg-muted/60",
                )}
              >
                <header className="border-b border-line px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", stageToneDot[tone])} aria-hidden="true" />
                    <h2 className="min-w-0 flex-1 truncate text-label font-bold text-fg">{stage.name}</h2>
                    <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-fg-muted tabular-nums">
                      {column.length}
                    </span>
                  </div>
                  <p className="mt-0.5 pl-4 text-xs text-fg-subtle tabular-nums">{formatMoney(total)}</p>
                </header>
                <ul className="flex min-h-24 flex-1 flex-col gap-2 p-2">
                  {column.length === 0 ? (
                    <li
                      className={cn(
                        "rounded-md border border-dashed px-2 py-6 text-center text-xs transition-colors",
                        isTarget ? "border-brand-strong text-brand-strong" : "border-transparent text-fg-subtle",
                      )}
                    >
                      {isTarget ? "Solte aqui para mover" : "Nenhuma oportunidade nesta etapa"}
                    </li>
                  ) : null}
                  {column.map((o) => (
                    <motion.li
                      key={o.id}
                      layoutId={`oportunidade-${o.id}`}
                      layout="position"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      className="list-none"
                    >
                      <div
                        draggable={canMove(o)}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", o.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDragging(o.id);
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setOverStage(null);
                        }}
                        onDrop={(e) => onDrop(e, stage.id, o.id)}
                        className={cn(
                          "rounded-md border border-line bg-surface p-3 shadow-card transition duration-150 hover:shadow-pop",
                          canMove(o) && "cursor-grab active:scale-102 active:cursor-grabbing active:shadow-float",
                          dragging === o.id && "scale-98 border-dashed border-brand-strong opacity-50 shadow-none",
                        )}
                      >
                        <Link href={`/funil/${o.id}`} className="block text-sm font-bold text-fg hover:underline" draggable={false}>
                          {o.contact_name}
                        </Link>
                        {o.is_demo ? (
                          <Badge tone="info" className="mt-1">
                            Demonstração
                          </Badge>
                        ) : null}
                        <dl className="mt-2 space-y-1 text-xs text-fg-muted">
                          {o.package_name || o.destination_interest ? (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <dt className="sr-only">Pacote ou destino</dt>
                              <dd className="truncate">{o.package_name ?? o.destination_interest}</dd>
                            </div>
                          ) : null}
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <dt className="sr-only">Valor estimado</dt>
                              <dd className="text-label font-semibold text-fg">{formatMoney(o.estimated_value_cents, o.currency)}</dd>
                            </div>
                            {o.travelers ? (
                              <div className="flex items-center gap-1">
                                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                                <dt className="sr-only">Viajantes</dt>
                                <dd>{o.travelers}</dd>
                              </div>
                            ) : null}
                          </div>
                          {o.departure_date || o.intended_date ? (
                            <div>
                              <dt className="inline">Data pretendida: </dt>
                              <dd className="inline">{formatDate(o.departure_date ?? o.intended_date)}</dd>
                            </div>
                          ) : null}
                          <div className="flex items-center gap-1.5">
                            <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <dt className="sr-only">Responsável</dt>
                            <dd className="truncate">{o.owner_name ?? "Sem responsável"}</dd>
                          </div>
                          {o.next_contact_at ? (
                            <div
                              className={cn(
                                "flex items-center gap-1.5",
                                new Date(o.next_contact_at) < new Date() && o.status === "open" && "font-semibold text-danger",
                              )}
                            >
                              <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <dt className="sr-only">Próximo contato</dt>
                              <dd>{formatDateTime(o.next_contact_at, timeZone)}</dd>
                            </div>
                          ) : null}
                          <div>
                            <dt className="inline">Última interação: </dt>
                            <dd className="inline">{o.last_interaction_at ? formatRelative(o.last_interaction_at) : "nenhuma"}</dd>
                          </div>
                        </dl>
                        {canMove(o) ? (
                          <select
                            aria-label={`Mover ${o.contact_name} para outra etapa`}
                            value={o.stage_id}
                            onChange={(e) =>
                              requestMove({
                                opportunityId: o.id,
                                stageId: e.target.value,
                                afterId:
                                  byStage(e.target.value)
                                    .filter((x) => x.id !== o.id)
                                    .at(-1)?.id ?? null,
                              })
                            }
                            className="mt-2.5 min-h-touch w-full cursor-pointer rounded border border-line bg-surface px-2 py-1 text-xs text-fg-muted transition-colors hover:border-line-strong sm:min-h-0"
                          >
                            {stages.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.id === o.stage_id ? `Etapa: ${s.name}` : `Mover para ${s.name}`}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                    </motion.li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </motion.div>

      <Dialog open={lostPrompt !== null} onClose={() => setLostPrompt(null)} title="Motivo da perda" size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!lostPrompt || lostReason.trim() === "") return;
            commit(lostPrompt, lostReason.trim());
            setLostPrompt(null);
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <label htmlFor="motivo-perda" className="block text-label font-semibold">
              Por que esta oportunidade foi perdida?
            </label>
            <input
              id="motivo-perda"
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              maxLength={500}
              required
              autoFocus
              placeholder="Ex.: preço, data, fechou com outra agência"
              className="elz-field"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLostPrompt(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={lostReason.trim() === ""}>
              Marcar como perdida
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
