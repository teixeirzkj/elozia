import { describe, expect, it } from "vitest";
import { zonedToUtc } from "@/lib/utils";
import {
  automationSchema,
  backoffMinutes,
  describeDelay,
  isWithinSendWindow,
  nextSendTime,
  splitDelay,
  summarizeResults,
  type ActionResult,
} from "@/modules/automations/types";
import { campaignSchema } from "@/modules/campaigns/types";

const ID = "4b7c1c3e-5c53-4d6e-9d55-0b1f3f6f8a11";
const next = (iso: string, tz: string) => nextSendTime(new Date(iso), tz, zonedToUtc).toISOString();

describe("horário de envio no fuso da agência", () => {
  it("dentro da janela (8h às 20h locais) envia na hora", () => {
    // 15:00 UTC = 12:00 em São Paulo
    expect(isWithinSendWindow(new Date("2026-03-10T15:00:00Z"), "America/Sao_Paulo")).toBe(true);
    expect(next("2026-03-10T15:00:00Z", "America/Sao_Paulo")).toBe("2026-03-10T15:00:00.000Z");
  });

  it("à noite, adia para as 8h do dia seguinte", () => {
    // 23:30 UTC = 20:30 em São Paulo
    expect(isWithinSendWindow(new Date("2026-03-10T23:30:00Z"), "America/Sao_Paulo")).toBe(false);
    expect(next("2026-03-10T23:30:00Z", "America/Sao_Paulo")).toBe("2026-03-11T11:00:00.000Z");
  });

  it("de madrugada, adia para as 8h do mesmo dia", () => {
    // 08:00 UTC = 05:00 em São Paulo
    expect(next("2026-03-10T08:00:00Z", "America/Sao_Paulo")).toBe("2026-03-10T11:00:00.000Z");
  });

  it("o mesmo instante pode estar dentro em um fuso e fora em outro", () => {
    const at = new Date("2026-03-10T11:30:00Z"); // 08:30 em São Paulo, 07:30 em Manaus, 06:30 no Acre
    expect(isWithinSendWindow(at, "America/Sao_Paulo")).toBe(true);
    expect(isWithinSendWindow(at, "America/Manaus")).toBe(false);
    expect(next("2026-03-10T11:30:00Z", "America/Manaus")).toBe("2026-03-10T12:00:00.000Z");
    expect(next("2026-03-10T11:30:00Z", "America/Rio_Branco")).toBe("2026-03-10T13:00:00.000Z");
  });

  it("vira o mês corretamente", () => {
    expect(next("2026-02-01T01:00:00Z", "America/Sao_Paulo")).toBe("2026-02-01T11:00:00.000Z"); // 22:00 de 31/01
  });
});

describe("reprocessamento", () => {
  it("a espera entre tentativas cresce e tem teto de 1 hora", () => {
    expect([1, 2, 3, 4, 5, 8, 20].map(backoffMinutes)).toEqual([1, 2, 4, 8, 16, 60, 60]);
  });

  it("resume o resultado de uma execução", () => {
    const r = (status: ActionResult["status"]): ActionResult => ({ type: "create_task", status, detail: "" });
    expect(summarizeResults([r("done"), r("done")])).toBe("success");
    expect(summarizeResults([r("done"), r("skipped")])).toBe("success");
    expect(summarizeResults([r("done"), r("failed")])).toBe("partial");
    expect(summarizeResults([r("failed"), r("skipped")])).toBe("failed");
    expect(summarizeResults([r("skipped")])).toBe("skipped");
    expect(summarizeResults([])).toBe("skipped");
  });
});

describe("configuração da automação", () => {
  const base = {
    name: "Retomar proposta",
    trigger_type: "proposal_no_response",
    delay_value: "2",
    delay_unit: "days",
    stage_id: "",
    package_id: "",
    tag_id: "",
    actions: [{ type: "create_task", title: "Ligar para o cliente", due_in_hours: "24", assignee_id: "" }],
    status: "active",
  };

  it("aceita o exemplo do briefing: proposta 2 dias sem resposta → criar tarefa", () => {
    const parsed = automationSchema.parse(base);
    expect(parsed).toMatchObject({ delay_value: 2, delay_unit: "days", stage_id: null });
    expect(parsed.actions[0]).toEqual({ type: "create_task", title: "Ligar para o cliente", due_in_hours: 24, assignee_id: null });
  });

  it("aceita as cinco ações previstas", () => {
    const actions = [
      { type: "create_task", title: "Tarefa", due_in_hours: 0 },
      { type: "change_owner", owner_id: ID },
      { type: "add_tag", tag_id: ID },
      { type: "move_opportunity", stage_id: ID },
      { type: "send_template", template_id: ID, variables: { body_1: { source: "contact_first_name" }, body_2: { source: "fixed", value: "Até breve" } } },
    ];
    expect(automationSchema.safeParse({ ...base, actions }).success).toBe(true);
  });

  it("recusa regra sem ação, com ações demais, intervalo inválido ou ação desconhecida", () => {
    expect(automationSchema.safeParse({ ...base, actions: [] }).success).toBe(false);
    expect(automationSchema.safeParse({ ...base, actions: Array(6).fill(base.actions[0]) }).success).toBe(false);
    expect(automationSchema.safeParse({ ...base, delay_value: "0" }).success).toBe(false);
    expect(automationSchema.safeParse({ ...base, delay_value: "400", delay_unit: "days" }).success).toBe(false);
    expect(automationSchema.safeParse({ ...base, actions: [{ type: "send_free_text", body: "oi" }] }).success).toBe(false);
    expect(automationSchema.safeParse({ ...base, actions: [{ type: "change_owner", owner_id: "não-é-uuid" }] }).success).toBe(false);
    expect(automationSchema.safeParse({ ...base, trigger_type: "qualquer" }).success).toBe(false);
  });

  it("variáveis de template só aceitam chaves e origens conhecidas", () => {
    const withVars = (variables: unknown) => automationSchema.safeParse({ ...base, actions: [{ type: "send_template", template_id: ID, variables }] }).success;
    expect(withVars({ body_1: { source: "contact_name" } })).toBe(true);
    expect(withVars({ "body_1; drop": { source: "contact_name" } })).toBe(false);
    expect(withVars({ body_1: { source: "senha_do_usuario" } })).toBe(false);
  });

  it("descreve o intervalo em linguagem natural", () => {
    expect(splitDelay(2880)).toEqual({ value: 2, unit: "days" });
    expect(splitDelay(90)).toEqual({ value: 90, unit: "minutes" });
    expect(describeDelay(2880)).toBe("2 dias");
    expect(describeDelay(60)).toBe("1 hora");
    expect(describeDelay(1)).toBe("1 minuto");
  });
});

describe("configuração da campanha", () => {
  const base = {
    name: "Gramado em julho",
    package_id: ID,
    departure_id: "",
    audience_interest: true,
    audience_tag_ids: [],
    template_id: ID,
    variables: {},
    scheduled_date: "2030-07-01",
    scheduled_time: "10:00",
    mode: "schedule",
  };

  it("aceita campanha segmentada e agendada", () => {
    expect(campaignSchema.safeParse(base).success).toBe(true);
    expect(campaignSchema.safeParse({ ...base, audience_interest: false, audience_tag_ids: [ID] }).success).toBe(true);
  });

  it("recusa disparo para toda a base (sem nenhum critério de público)", () => {
    const result = campaignSchema.safeParse({ ...base, audience_interest: false, audience_tag_ids: [] });
    expect(result.success).toBe(false);
  });

  it("agendar exige data e horário; rascunho não", () => {
    expect(campaignSchema.safeParse({ ...base, scheduled_date: "" }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...base, scheduled_date: "", mode: "draft" }).success).toBe(true);
    expect(campaignSchema.safeParse({ ...base, mode: "enviar_agora_para_todos" }).success).toBe(false);
  });
});
