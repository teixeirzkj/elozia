/** Fusos horários do Brasil oferecidos nas configurações da agência. */
export const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasília (São Paulo, Rio, Sul, Sudeste)" },
  { value: "America/Bahia", label: "Bahia" },
  { value: "America/Fortaleza", label: "Fortaleza (Nordeste)" },
  { value: "America/Recife", label: "Recife" },
  { value: "America/Belem", label: "Belém" },
  { value: "America/Manaus", label: "Manaus (Amazonas)" },
  { value: "America/Cuiaba", label: "Cuiabá (Mato Grosso)" },
  { value: "America/Campo_Grande", label: "Campo Grande (Mato Grosso do Sul)" },
  { value: "America/Porto_Velho", label: "Porto Velho (Rondônia)" },
  { value: "America/Boa_Vista", label: "Boa Vista (Roraima)" },
  { value: "America/Rio_Branco", label: "Rio Branco (Acre)" },
  { value: "America/Noronha", label: "Fernando de Noronha" },
] as const;

export const TIMEZONE_VALUES = TIMEZONES.map((t) => t.value) as [string, ...string[]];
