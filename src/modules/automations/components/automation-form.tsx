"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import type { VariableMapping } from "@/lib/whatsapp/templates";
import type { Template } from "@/modules/channels/queries";
import type { Option, Stage, Tag } from "@/modules/crm/types";
import { saveAutomationAction } from "../actions";
import { ACTION_LABELS, DELAY_UNITS, splitDelay, TRIGGERS, type Automation, type AutomationAction, type DelayUnit, type TriggerType } from "../types";
import { defaultMapping, TemplateVariables } from "./template-variables";

type Props = {
  automation?: Automation;
  stages: Stage[];
  packages: Option[];
  tags: Tag[];
  members: Option[];
  templates: Template[];
};

function newAction(type: AutomationAction["type"], ctx: Props): AutomationAction {
  switch (type) {
    case "create_task":
      return { type, title: "", due_in_hours: 24, assignee_id: null };
    case "change_owner":
      return { type, owner_id: ctx.members[0]?.id ?? "" };
    case "add_tag":
      return { type, tag_id: ctx.tags[0]?.id ?? "" };
    case "move_opportunity":
      return { type, stage_id: ctx.stages[0]?.id ?? "" };
    case "send_template":
      return { type, template_id: ctx.templates[0]?.id ?? "", variables: defaultMapping(ctx.templates[0]) };
  }
}

/** Formulário guiado em três passos: quando, o que fazer e ativação. */
export function AutomationForm(props: Props) {
  const { automation, stages, packages, tags, members, templates } = props;
  const initialDelay = splitDelay(automation?.delay_minutes ?? 2880);
  const [name, setName] = useState(automation?.name ?? "");
  const [trigger, setTrigger] = useState<TriggerType>(automation?.trigger_type ?? "proposal_no_response");
  const [delayValue, setDelayValue] = useState(String(initialDelay.value));
  const [delayUnit, setDelayUnit] = useState<DelayUnit>(initialDelay.unit);
  const [stageId, setStageId] = useState(automation?.stage_id ?? "");
  const [packageId, setPackageId] = useState(automation?.package_id ?? "");
  const [tagId, setTagId] = useState(automation?.tag_id ?? "");
  const [actions, setActions] = useState<AutomationAction[]>(automation?.actions ?? [newAction("create_task", props)]);
  const [status, setStatus] = useState<"active" | "paused">(automation?.status ?? "paused");

  const conditions = TRIGGERS[trigger].conditions as readonly string[];
  const update = (index: number, patch: Partial<AutomationAction>) =>
    setActions((list) => list.map((a, i) => (i === index ? ({ ...a, ...patch } as AutomationAction) : a)));

  const config = JSON.stringify({
    name,
    trigger_type: trigger,
    delay_value: delayValue,
    delay_unit: delayUnit,
    stage_id: stageId,
    package_id: packageId,
    tag_id: tagId,
    actions,
    status,
  });

  const available = (Object.keys(ACTION_LABELS) as AutomationAction["type"][]).filter((type) => {
    if (type === "send_template") return templates.length > 0;
    if (type === "add_tag") return tags.length > 0;
    return true;
  });

  return (
    <ActionForm action={saveAutomationAction.bind(null, automation?.id ?? null)} className="max-w-3xl space-y-6">
      <input type="hidden" name="config" value={config} />

      <Card>
        <CardHeader title="1. Quando" description="O gatilho e o intervalo que disparam a regra." />
        <CardBody className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="auto-trigger" className="block text-[13px] font-semibold">
              Gatilho
            </label>
            <select id="auto-trigger" value={trigger} onChange={(e) => setTrigger(e.target.value as TriggerType)} className="elz-field">
              {Object.entries(TRIGGERS).map(([value, t]) => (
                <option key={value} value={value}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="text-[13px] text-fg-subtle">{TRIGGERS[trigger].description}</p>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-[13px] font-semibold">Intervalo</legend>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={1}
                value={delayValue}
                onChange={(e) => setDelayValue(e.target.value)}
                aria-label="Quantidade"
                className="elz-field w-24"
                required
              />
              <select value={delayUnit} onChange={(e) => setDelayUnit(e.target.value as DelayUnit)} aria-label="Unidade" className="elz-field w-auto">
                {Object.entries(DELAY_UNITS).map(([value, unit]) => (
                  <option key={value} value={value}>
                    {unit.label}
                  </option>
                ))}
              </select>
              <span className="text-sm text-fg-muted">{TRIGGERS[trigger].interval}</span>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-[13px] font-semibold">Condições (opcionais)</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {conditions.includes("stage") ? (
                <select value={stageId} onChange={(e) => setStageId(e.target.value)} aria-label="Etapa do funil" className="elz-field">
                  <option value="">Qualquer etapa aberta</option>
                  {stages
                    .filter((s) => s.kind === "open")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        Etapa: {s.name}
                      </option>
                    ))}
                </select>
              ) : null}
              {conditions.includes("package") ? (
                <select value={packageId} onChange={(e) => setPackageId(e.target.value)} aria-label="Pacote" className="elz-field">
                  <option value="">Qualquer pacote</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : null}
              {conditions.includes("tag") ? (
                <select value={tagId} onChange={(e) => setTagId(e.target.value)} aria-label="Etiqueta do contato" className="elz-field">
                  <option value="">Qualquer contato</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      Etiqueta: {t.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="2. O que fazer" description="As ações são executadas na ordem, uma vez por ocorrência." />
        <CardBody className="space-y-4">
          {actions.map((action, index) => (
            <div key={index} className="space-y-3 rounded-md border border-line p-4">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-fg-muted">Ação {index + 1}</span>
                <select
                  value={action.type}
                  onChange={(e) => setActions((list) => list.map((a, i) => (i === index ? newAction(e.target.value as AutomationAction["type"], props) : a)))}
                  aria-label={`Tipo da ação ${index + 1}`}
                  className="elz-field flex-1"
                >
                  {available.concat(available.includes(action.type) ? [] : [action.type]).map((type) => (
                    <option key={type} value={type}>
                      {ACTION_LABELS[type]}
                    </option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={actions.length === 1}
                  onClick={() => setActions((list) => list.filter((_, i) => i !== index))}
                  aria-label={`Remover ação ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              {action.type === "create_task" ? (
                <div className="grid gap-3 sm:grid-cols-[1fr_130px_1fr]">
                  <input
                    value={action.title}
                    onChange={(e) => update(index, { title: e.target.value })}
                    placeholder="Título da tarefa"
                    aria-label="Título da tarefa"
                    maxLength={200}
                    required
                    className="elz-field"
                  />
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={720}
                      value={action.due_in_hours}
                      onChange={(e) => update(index, { due_in_hours: Number(e.target.value) })}
                      aria-label="Prazo em horas"
                      className="elz-field"
                    />
                    <span className="text-[13px] text-fg-muted">h</span>
                  </div>
                  <select value={action.assignee_id ?? ""} onChange={(e) => update(index, { assignee_id: e.target.value || null })} aria-label="Responsável pela tarefa" className="elz-field">
                    <option value="">Responsável pelo contato ou oportunidade</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {action.type === "change_owner" ? (
                <select value={action.owner_id} onChange={(e) => update(index, { owner_id: e.target.value })} aria-label="Novo responsável" className="elz-field">
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              ) : null}

              {action.type === "add_tag" ? (
                <select value={action.tag_id} onChange={(e) => update(index, { tag_id: e.target.value })} aria-label="Etiqueta" className="elz-field">
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              ) : null}

              {action.type === "move_opportunity" ? (
                <select value={action.stage_id} onChange={(e) => update(index, { stage_id: e.target.value })} aria-label="Etapa de destino" className="elz-field">
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : null}

              {action.type === "send_template" ? (
                <div className="space-y-3">
                  <select
                    value={action.template_id}
                    onChange={(e) => update(index, { template_id: e.target.value, variables: defaultMapping(templates.find((t) => t.id === e.target.value)) })}
                    aria-label="Template aprovado"
                    className="elz-field"
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.language}) · {t.category === "MARKETING" ? "marketing" : "utilidade"}
                      </option>
                    ))}
                  </select>
                  <TemplateVariables
                    idPrefix={`acao-${index}`}
                    template={templates.find((t) => t.id === action.template_id)}
                    value={action.variables as VariableMapping}
                    onChange={(variables) => update(index, { variables })}
                  />
                  <Alert tone="info">
                    Enviado somente entre 8h e 20h no fuso da agência. Templates de marketing vão apenas para contatos com
                    consentimento registrado; quem pediu descadastro nunca recebe mensagens automáticas.
                  </Alert>
                </div>
              ) : null}
            </div>
          ))}
          <Button variant="secondary" disabled={actions.length >= 5} onClick={() => setActions((list) => [...list, newAction("create_task", props)])}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Adicionar ação
          </Button>
          {templates.length === 0 ? (
            <p className="text-[13px] text-fg-subtle">
              Para agendar mensagens, conecte o WhatsApp e sincronize templates aprovados em Configurações › Canais.
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="3. Nome e ativação" />
        <CardBody className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="auto-name" className="block text-[13px] font-semibold">
              Nome da automação
            </label>
            <input id="auto-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required placeholder="Ex.: Retomar proposta sem resposta" className="elz-field" />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-semibold">Situação</legend>
            {(
              [
                ["active", "Ativa", "Passa a valer para o que vencer a partir da ativação. Situações antigas não disparam."],
                ["paused", "Pausada", "Fica salva sem executar nada."],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value} className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line p-3 text-sm has-[:checked]:border-ink">
                <input type="radio" checked={status === value} onChange={() => setStatus(value)} className="mt-1 accent-[var(--elz-green-strong)]" />
                <span>
                  <strong>{label}</strong>
                  <span className="block text-[13px] text-fg-muted">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap justify-end gap-2">
            <LinkButton href="/automacoes" variant="secondary">
              Cancelar
            </LinkButton>
            <SubmitButton>Salvar automação</SubmitButton>
          </div>
        </CardBody>
      </Card>
    </ActionForm>
  );
}
