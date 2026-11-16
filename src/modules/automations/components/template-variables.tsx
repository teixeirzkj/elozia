"use client";

import { TEMPLATE_VARIABLE_SOURCES, type TemplateVariableSource, type VariableMapping } from "@/lib/whatsapp/templates";
import type { Template } from "@/modules/channels/queries";

/**
 * Define de onde vem o valor de cada variável de um template em envios
 * automáticos (automações e campanhas).
 */
export function TemplateVariables({
  template,
  value,
  onChange,
  idPrefix,
}: {
  template: Template | undefined;
  value: VariableMapping;
  onChange: (next: VariableMapping) => void;
  idPrefix: string;
}) {
  if (!template) return null;
  const params = [...template.spec.headerParams.map((p) => [`header_${p}`, `Cabeçalho {{${p}}}`] as const), ...template.spec.bodyParams.map((p) => [`body_${p}`, `Variável {{${p}}}`] as const)];

  return (
    <div className="space-y-3">
      <p className="rounded-md bg-muted p-3 text-[13px] whitespace-pre-line text-fg-muted">
        {[template.spec.headerText, template.spec.bodyText, template.spec.footerText].filter(Boolean).join("\n\n")}
      </p>
      {params.length === 0 ? <p className="text-[13px] text-fg-subtle">Este template não tem variáveis.</p> : null}
      {params.map(([key, label]) => {
        const rule = value[key] ?? { source: "contact_first_name" as TemplateVariableSource };
        return (
          <div key={key} className="grid gap-2 sm:grid-cols-[150px_1fr_1fr] sm:items-center">
            <label htmlFor={`${idPrefix}-${key}`} className="text-[13px] font-semibold">
              {label}
            </label>
            <select
              id={`${idPrefix}-${key}`}
              value={rule.source}
              onChange={(e) => onChange({ ...value, [key]: { source: e.target.value as TemplateVariableSource, value: rule.value } })}
              className="elz-field"
            >
              {Object.entries(TEMPLATE_VARIABLE_SOURCES).map(([source, text]) => (
                <option key={source} value={source}>
                  {text}
                </option>
              ))}
            </select>
            {rule.source === "fixed" ? (
              <input
                aria-label={`Texto fixo para ${label}`}
                value={rule.value ?? ""}
                onChange={(e) => onChange({ ...value, [key]: { source: "fixed", value: e.target.value } })}
                maxLength={200}
                placeholder="Texto fixo"
                className="elz-field"
              />
            ) : (
              <span className="hidden sm:block" />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Mapeamento inicial: toda variável do template recebe uma origem padrão. */
export function defaultMapping(template: Template | undefined, current: VariableMapping = {}): VariableMapping {
  if (!template) return {};
  const out: VariableMapping = {};
  for (const key of [...template.spec.headerParams.map((p) => `header_${p}`), ...template.spec.bodyParams.map((p) => `body_${p}`)]) {
    out[key] = current[key] ?? { source: "contact_first_name" };
  }
  return out;
}
