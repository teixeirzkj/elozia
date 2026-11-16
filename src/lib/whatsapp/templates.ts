/**
 * Templates da Meta: o que o sistema consegue enviar e como montar as variáveis.
 * Suportados no MVP: corpo com variáveis (numeradas ou nomeadas) e cabeçalho de
 * texto. Cabeçalho de mídia e botões com parâmetro dinâmico ficam de fora.
 */

type Component = {
  type?: string;
  format?: string;
  text?: string;
  buttons?: Array<{ type?: string; url?: string; example?: unknown }>;
};

export type TemplateSpec = {
  supported: boolean;
  reason: string | null;
  headerText: string | null;
  bodyText: string;
  footerText: string | null;
  /** Variáveis do cabeçalho e do corpo, na ordem em que aparecem. */
  headerParams: string[];
  bodyParams: string[];
  named: boolean;
};

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

export function extractParams(text: string | undefined | null): string[] {
  const out: string[] = [];
  for (const match of (text ?? "").matchAll(PLACEHOLDER)) {
    if (!out.includes(match[1]!)) out.push(match[1]!);
  }
  return out;
}

export function describeTemplate(components: unknown): TemplateSpec {
  const list = (Array.isArray(components) ? components : []) as Component[];
  const find = (type: string) => list.find((c) => c.type?.toUpperCase() === type);
  const header = find("HEADER");
  const body = find("BODY");
  const footer = find("FOOTER");
  const buttons = find("BUTTONS");

  const spec: TemplateSpec = {
    supported: true,
    reason: null,
    headerText: header?.format?.toUpperCase() === "TEXT" ? (header.text ?? null) : null,
    bodyText: body?.text ?? "",
    footerText: footer?.text ?? null,
    headerParams: [],
    bodyParams: extractParams(body?.text),
    named: false,
  };
  spec.headerParams = extractParams(spec.headerText);
  spec.named = [...spec.headerParams, ...spec.bodyParams].some((p) => !/^\d+$/.test(p));

  if (!body?.text) return { ...spec, supported: false, reason: "Template sem corpo de texto." };
  if (header && header.format?.toUpperCase() !== "TEXT") {
    return { ...spec, supported: false, reason: "Templates com imagem, vídeo ou documento no cabeçalho ainda não são suportados." };
  }
  if ((buttons?.buttons ?? []).some((b) => /\{\{.+\}\}/.test(b.url ?? "") || b.type?.toUpperCase() === "COPY_CODE" || b.type?.toUpperCase() === "OTP")) {
    return { ...spec, supported: false, reason: "Templates com botões de conteúdo dinâmico ainda não são suportados." };
  }
  return spec;
}

/** Monta `components` para o envio, validando que toda variável tem valor. */
export function buildTemplateComponents(
  spec: TemplateSpec,
  values: Record<string, string>,
): { ok: true; components: unknown[]; rendered: string } | { ok: false; error: string } {
  if (!spec.supported) return { ok: false, error: spec.reason ?? "Template não suportado." };
  const toParams = (names: string[], prefix: string) =>
    names.map((name) => {
      const value = (values[`${prefix}${name}`] ?? "").trim();
      return { name, value };
    });
  const header = toParams(spec.headerParams, "header_");
  const body = toParams(spec.bodyParams, "body_");
  const missing = [...header, ...body].find((p) => p.value === "");
  if (missing) return { ok: false, error: `Preencha a variável {{${missing.name}}} do template.` };
  if ([...header, ...body].some((p) => /[\n\t]| {4,}/.test(p.value) || p.value.length > 1000)) {
    return { ok: false, error: "As variáveis não podem ter quebras de linha, tabulações nem mais de 1.000 caracteres." };
  }

  const param = (p: { name: string; value: string }) => ({ type: "text", text: p.value, ...(spec.named ? { parameter_name: p.name } : {}) });
  const components: unknown[] = [];
  if (header.length) components.push({ type: "header", parameters: header.map(param) });
  if (body.length) components.push({ type: "body", parameters: body.map(param) });

  const fill = (text: string | null, params: Array<{ name: string; value: string }>) =>
    (text ?? "").replace(PLACEHOLDER, (_, name: string) => params.find((p) => p.name === name)?.value ?? "");
  const rendered = [fill(spec.headerText, header), fill(spec.bodyText, body), spec.footerText ?? ""].filter((part) => part.trim() !== "").join("\n\n");
  return { ok: true, components, rendered };
}

/** Campos do contato que podem preencher variáveis em envios automáticos. */
export const TEMPLATE_VARIABLE_SOURCES = {
  contact_first_name: "Primeiro nome do contato",
  contact_name: "Nome completo do contato",
  package_name: "Nome do pacote",
  package_destination: "Destino do pacote",
  departure_date: "Data de saída",
  agency_name: "Nome da agência",
  fixed: "Texto fixo",
} as const;
export type TemplateVariableSource = keyof typeof TEMPLATE_VARIABLE_SOURCES;

export type VariableMapping = Record<string, { source: TemplateVariableSource; value?: string }>;

export type VariableContext = {
  contactName: string;
  packageName?: string | null;
  packageDestination?: string | null;
  departureDate?: string | null;
  agencyName: string;
};

/** Resolve o mapeamento de variáveis de um envio automático para valores concretos. */
export function resolveVariables(mapping: VariableMapping, context: VariableContext): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, rule] of Object.entries(mapping)) {
    switch (rule.source) {
      case "contact_first_name":
        out[key] = context.contactName.trim().split(/\s+/)[0] ?? "";
        break;
      case "contact_name":
        out[key] = context.contactName.trim();
        break;
      case "package_name":
        out[key] = context.packageName ?? "";
        break;
      case "package_destination":
        out[key] = context.packageDestination ?? "";
        break;
      case "departure_date":
        out[key] = context.departureDate ? context.departureDate.slice(0, 10).split("-").reverse().join("/") : "";
        break;
      case "agency_name":
        out[key] = context.agencyName;
        break;
      case "fixed":
        out[key] = rule.value ?? "";
        break;
    }
  }
  return out;
}
