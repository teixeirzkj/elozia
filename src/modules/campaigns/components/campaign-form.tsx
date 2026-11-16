"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { LinkButton } from "@/components/ui/button";
import { ActionForm, SubmitButton, useFormState } from "@/components/ui/form";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { formatDate, utcToZonedParts } from "@/lib/utils";
import type { VariableMapping } from "@/lib/whatsapp/templates";
import { defaultMapping, TemplateVariables } from "@/modules/automations/components/template-variables";
import type { PackageOption } from "@/modules/catalog/queries";
import type { Template } from "@/modules/channels/queries";
import type { Tag } from "@/modules/crm/types";
import { audienceCountAction, saveCampaignAction } from "../actions";
import type { Campaign } from "../types";

type Props = {
  campaign?: Campaign;
  packages: PackageOption[];
  tags: Tag[];
  templates: Template[];
  timeZone: string;
  initialPackageId?: string;
};

function FieldError({ name }: { name: string }) {
  const { state } = useFormState();
  const message = state.fieldErrors?.[name]?.[0];
  return message ? (
    <p className="text-[13px] text-danger" role="alert">
      {message}
    </p>
  ) : null;
}

export function CampaignForm({ campaign, packages, tags, templates, timeZone, initialPackageId }: Props) {
  const scheduled = campaign?.scheduled_at ? utcToZonedParts(campaign.scheduled_at, timeZone) : null;
  const [name, setName] = useState(campaign?.name ?? "");
  const [packageId, setPackageId] = useState(campaign?.package_id ?? initialPackageId ?? packages[0]?.id ?? "");
  const [departureId, setDepartureId] = useState(campaign?.departure_id ?? "");
  const [interest, setInterest] = useState(campaign?.audience_interest ?? true);
  const [tagIds, setTagIds] = useState<string[]>(campaign?.audience_tag_ids ?? []);
  const [templateId, setTemplateId] = useState(campaign?.template_id ?? templates[0]?.id ?? "");
  const [variables, setVariables] = useState<VariableMapping>(
    campaign?.variables && Object.keys(campaign.variables).length > 0 ? campaign.variables : defaultMapping(templates.find((t) => t.id === (campaign?.template_id ?? templates[0]?.id))),
  );
  const [date, setDate] = useState(scheduled?.date ?? "");
  const [time, setTime] = useState(scheduled?.time ?? "10:00");
  const [audience, setAudience] = useState<number | null | "loading">(null);

  const departures = packages.find((p) => p.id === packageId)?.departures ?? [];
  const template = templates.find((t) => t.id === templateId);
  const tagKey = tagIds.join(",");

  // Prévia do público sempre que o segmento muda.
  useEffect(() => {
    if (!packageId || (!interest && tagKey === "")) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setAudience("loading");
      const result = await audienceCountAction({ packageId, interest, tagIds: tagKey ? tagKey.split(",") : [] });
      if (!cancelled) setAudience(result.count);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [packageId, interest, tagKey]);

  const hasSegment = interest || tagIds.length > 0;
  const config = JSON.stringify({
    name,
    package_id: packageId,
    departure_id: departureId,
    audience_interest: interest,
    audience_tag_ids: tagIds,
    template_id: templateId,
    variables,
    scheduled_date: date,
    scheduled_time: time,
  });

  if (templates.length === 0 || packages.length === 0) {
    return (
      <Alert tone="warning" title="Ainda não é possível criar campanhas">
        {packages.length === 0
          ? "Cadastre ao menos um pacote em Viagens."
          : "Conecte o WhatsApp e sincronize ao menos um template aprovado em Configurações › Canais."}
      </Alert>
    );
  }

  return (
    <ActionForm action={saveCampaignAction.bind(null, campaign?.id ?? null)} className="max-w-3xl space-y-6">
      <input type="hidden" name="config" value={config} />

      <Card>
        <CardHeader title="Viagem" description="A campanha é sempre ligada a um pacote do catálogo." />
        <CardBody className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="camp-name" className="block text-[13px] font-semibold">
              Nome da campanha
            </label>
            <input id="camp-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required className="elz-field" />
            <FieldError name="name" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="camp-package" className="block text-[13px] font-semibold">
                Pacote
              </label>
              <select
                id="camp-package"
                value={packageId}
                onChange={(e) => {
                  setPackageId(e.target.value);
                  setDepartureId("");
                }}
                className="elz-field"
              >
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.destination}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="camp-departure" className="block text-[13px] font-semibold">
                Saída (opcional)
              </label>
              <select id="camp-departure" value={departureId} onChange={(e) => setDepartureId(e.target.value)} className="elz-field">
                <option value="">Sem saída específica</option>
                {departures.map((d) => (
                  <option key={d.id} value={d.id}>
                    {formatDate(d.departs_on)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Público" description="Só entram contatos com consentimento registrado, telefone e sem pedido de descadastro." />
        <CardBody className="space-y-4">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input type="checkbox" checked={interest} onChange={(e) => setInterest(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--elz-green-strong)]" />
            <span>
              <strong>Demonstraram interesse neste pacote</strong>
              <span className="block text-[13px] text-fg-muted">Contatos com oportunidade ligada ao pacote, em qualquer etapa.</span>
            </span>
          </label>
          {tags.length > 0 ? (
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-semibold">Com alguma destas etiquetas</legend>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <label
                    key={tag.id}
                    className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[13px] has-[:checked]:border-ink has-[:checked]:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={tagIds.includes(tag.id)}
                      onChange={(e) => setTagIds((list) => (e.target.checked ? [...list, tag.id] : list.filter((id) => id !== tag.id)))}
                      className="sr-only"
                    />
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} aria-hidden="true" />
                    {tag.name}
                  </label>
                ))}
              </div>
              {interest && tagIds.length > 0 ? <p className="mt-1.5 text-[13px] text-fg-subtle">Com os dois critérios, o contato precisa atender a ambos.</p> : null}
            </fieldset>
          ) : null}
          <FieldError name="audience_interest" />
          <div aria-live="polite">
            {!hasSegment ? (
              <Alert tone="warning">Escolha ao menos um critério. Campanhas não são enviadas para toda a base de contatos.</Alert>
            ) : audience === "loading" ? (
              <p className="text-sm text-fg-muted">Calculando o público…</p>
            ) : audience === null ? (
              <p className="text-sm text-fg-muted">Não foi possível calcular o público agora.</p>
            ) : (
              <Alert tone={audience === 0 ? "warning" : "info"}>
                {audience === 0
                  ? "Nenhum contato atende a este público com consentimento registrado."
                  : `${audience} ${audience === 1 ? "contato atende" : "contatos atendem"} a este público hoje. A lista final é definida no momento do envio (até 2.000 contatos), e o consentimento é conferido de novo em cada mensagem.`}
              </Alert>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Mensagem" description="Somente templates aprovados pela Meta podem ser usados em campanhas." />
        <CardBody className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="camp-template" className="block text-[13px] font-semibold">
              Template
            </label>
            <select
              id="camp-template"
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                setVariables(defaultMapping(templates.find((t) => t.id === e.target.value)));
              }}
              className="elz-field"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.language}) · {t.category === "MARKETING" ? "marketing" : "utilidade"}
                </option>
              ))}
            </select>
          </div>
          <TemplateVariables idPrefix="camp" template={template} value={variables} onChange={setVariables} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Envio" description="Horários no fuso da agência. Campanhas saem entre 8h e 20h." />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="camp-date" className="block text-[13px] font-semibold">
                Data
              </label>
              <input id="camp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="elz-field" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="camp-time" className="block text-[13px] font-semibold">
                Horário
              </label>
              <input id="camp-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="elz-field" />
            </div>
          </div>
          <FieldError name="scheduled_date" />
          <div className="flex flex-wrap justify-end gap-2">
            <LinkButton href="/campanhas" variant="secondary">
              Cancelar
            </LinkButton>
            <SubmitButton variant="secondary" name="mode" value="draft">
              Salvar rascunho
            </SubmitButton>
            <SubmitButton variant="brand" name="mode" value="schedule">
              Agendar campanha
            </SubmitButton>
          </div>
        </CardBody>
      </Card>
    </ActionForm>
  );
}
