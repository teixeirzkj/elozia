import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/utils";
import { csvHeader, csvValue, formatDuration, percent, REPORT_KEYS, REPORTS, resolvePeriod } from "@/modules/reports/definitions";

const NOW = new Date("2026-11-16T15:00:00Z"); // 12:00 em São Paulo

describe("período dos relatórios", () => {
  it("usa os últimos 30 dias no fuso da agência quando não há datas", () => {
    expect(resolvePeriod(undefined, undefined, "America/Sao_Paulo", NOW)).toEqual({
      fromDate: "2026-10-18",
      toDate: "2026-11-16",
      from: "2026-10-18T03:00:00.000Z",
      to: "2026-11-17T03:00:00.000Z",
    });
  });

  it("o dia termina à meia-noite do fuso da agência, não em UTC", () => {
    const manaus = resolvePeriod("2026-11-01", "2026-11-01", "America/Manaus", NOW);
    expect([manaus.from, manaus.to]).toEqual(["2026-11-01T04:00:00.000Z", "2026-11-02T04:00:00.000Z"]);
    // 23:00 de 16/11 em UTC ainda é dia 16 em São Paulo, mas 02:00 UTC do dia 17 também é dia 16
    expect(resolvePeriod(undefined, undefined, "America/Sao_Paulo", new Date("2026-11-17T02:00:00Z")).toDate).toBe("2026-11-16");
  });

  it("corrige datas invertidas, ignora datas inválidas e limita a um ano", () => {
    expect(resolvePeriod("2026-11-10", "2026-11-01", "America/Sao_Paulo", NOW)).toMatchObject({ fromDate: "2026-11-01", toDate: "2026-11-10" });
    expect(resolvePeriod("'; drop table", "ontem", "America/Sao_Paulo", NOW)).toMatchObject({ fromDate: "2026-10-18", toDate: "2026-11-16" });
    expect(resolvePeriod("2020-01-01", "2026-11-16", "America/Sao_Paulo", NOW).fromDate).toBe("2025-11-15");
  });
});

describe("formatação", () => {
  it("duração legível e vazio quando não há medição", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(120)).toBe("2 min");
    expect(formatDuration(3900)).toBe("1 h 05 min");
  });

  it("percentual não divide por zero", () => {
    expect(percent(1, 4)).toBe("25%");
    expect(percent(0, 0)).toBe("—");
  });
});

describe("exportação CSV", () => {
  it("todo relatório tem colunas com rótulo em português", () => {
    expect(REPORT_KEYS).toEqual(["sales", "funnel", "packages", "sources", "attendance", "campaigns", "automations", "lost"]);
    for (const key of REPORT_KEYS) {
      expect(REPORTS[key].columns.length).toBeGreaterThan(1);
      for (const column of REPORTS[key].columns) expect(column.label).not.toMatch(/_/);
    }
  });

  it("converte valores, rótulos e durações", () => {
    const [name, , , , , , value] = REPORTS.sales.columns;
    const row = { owner_name: "Ana Teste", won_value_cents: 123456 };
    expect(csvValue(name, row)).toBe("Ana Teste");
    expect(csvValue(value, row)).toBe("1234,56");
    expect(csvValue(REPORTS.sources.columns[0], { source: "indicacao" })).toBe("Indicação");
    expect(csvValue(REPORTS.funnel.columns[1], { kind: "won" })).toBe("Ganho");
    const duration = REPORTS.attendance.columns[4];
    expect(csvHeader(duration)).toBe("Primeira resposta (média) em segundos");
    expect(csvValue(duration, { first_response_avg_seconds: null })).toBe("");
    expect(csvValue(duration, { first_response_avg_seconds: 119.6 })).toBe(120);
  });

  it("um nome malicioso não vira fórmula na planilha", () => {
    const columns = REPORTS.lost.columns;
    const csv = toCsv(columns.map(csvHeader), [columns.map((c) => csvValue(c, { reason: '=HYPERLINK("http://malicioso.test")', lost: 1, value_cents: 0 }))]);
    expect(csv).toContain(`"'=HYPERLINK(""http://malicioso.test"")"`);
  });
});
