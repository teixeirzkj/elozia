/** Tipos e rótulos compartilhados pelos módulos do CRM. */

export const CONTACT_SOURCES = {
  manual: "Cadastro manual",
  whatsapp: "WhatsApp",
  import: "Importação",
  indicacao: "Indicação",
  instagram: "Instagram",
  site: "Site",
  telefone: "Telefone",
  evento: "Evento",
  outro: "Outro",
} as const;
export type ContactSource = keyof typeof CONTACT_SOURCES;
export const CONTACT_SOURCE_VALUES = Object.keys(CONTACT_SOURCES) as [ContactSource, ...ContactSource[]];

export const CONSENT_LABELS = {
  unknown: "Não informado",
  granted: "Autorizou comunicações",
  revoked: "Não autoriza / descadastrado",
} as const;
export type Consent = keyof typeof CONSENT_LABELS;

export const ITEM_STATUS_LABELS = { active: "Ativo", paused: "Pausado", closed: "Encerrado" } as const;
export type ItemStatus = keyof typeof ITEM_STATUS_LABELS;

export const STAGE_KIND_LABELS = { open: "Em andamento", won: "Ganho", lost: "Perda" } as const;
export type StageKind = keyof typeof STAGE_KIND_LABELS;

export const PROPOSAL_STATUS_LABELS = {
  draft: "Rascunho",
  sent: "Enviada",
  accepted: "Aceita",
  rejected: "Recusada",
  expired: "Expirada",
} as const;
export type ProposalStatus = keyof typeof PROPOSAL_STATUS_LABELS;

export const BOOKING_STATUS_LABELS = { pending: "Aguardando confirmação", confirmed: "Confirmada", cancelled: "Cancelada" } as const;
export type BookingStatus = keyof typeof BOOKING_STATUS_LABELS;

export const PAYMENT_STATUS_LABELS = { pending: "Pendente", partial: "Parcial", paid: "Pago", refunded: "Estornado" } as const;
export type PaymentStatus = keyof typeof PAYMENT_STATUS_LABELS;

export const PAYMENT_METHOD_LABELS = {
  pix: "Pix",
  boleto: "Boleto",
  cartao: "Cartão (processado fora do sistema)",
  transferencia: "Transferência",
  dinheiro: "Dinheiro",
  outro: "Outro",
} as const;
export type PaymentMethod = keyof typeof PAYMENT_METHOD_LABELS;

export const EVENT_TYPE_LABELS: Record<string, string> = {
  created: "Cadastro",
  note: "Anotação",
  call: "Ligação",
  email: "E-mail",
  meeting: "Reunião",
  whatsapp: "WhatsApp",
  stage_change: "Funil",
  proposal: "Proposta",
  booking: "Reserva",
  consent: "Consentimento",
  task: "Tarefa",
  automation: "Automação",
  campaign: "Campanha",
};
export const MANUAL_EVENT_TYPES = ["note", "call", "email", "meeting"] as const;

export type Tag = { id: string; name: string; color: string };

export type Contact = {
  id: string;
  name: string;
  phone_e164: string | null;
  email: string | null;
  notes: string | null;
  source: ContactSource;
  owner_id: string | null;
  marketing_consent: Consent;
  consent_at: string | null;
  consent_source: string | null;
  opted_out_at: string | null;
  is_demo: boolean;
  created_at: string;
  tags: Tag[];
};

export type ContactEvent = {
  id: string;
  type: string;
  body: string | null;
  created_at: string;
  actor_name: string | null;
};

export type Departure = {
  id: string;
  package_id: string;
  departs_on: string;
  returns_on: string | null;
  price_cents: number | null;
  seats_total: number | null;
  status: ItemStatus;
  notes: string | null;
};

export type TravelPackage = {
  id: string;
  name: string;
  destination: string;
  description: string | null;
  price_cents: number | null;
  currency: string;
  status: ItemStatus;
  image_path: string | null;
  commercial_notes: string | null;
  is_demo: boolean;
  departures: Departure[];
};

export type Stage = { id: string; name: string; position: number; kind: StageKind };

export type Opportunity = {
  id: string;
  contact_id: string;
  contact_name: string;
  package_id: string | null;
  package_name: string | null;
  departure_id: string | null;
  departure_date: string | null;
  destination_interest: string | null;
  stage_id: string;
  position: number;
  estimated_value_cents: number | null;
  currency: string;
  intended_date: string | null;
  travelers: number | null;
  owner_id: string | null;
  owner_name: string | null;
  next_contact_at: string | null;
  last_interaction_at: string | null;
  status: StageKind;
  lost_reason: string | null;
  notes: string | null;
  is_demo: boolean;
  created_at: string;
};

export type Proposal = {
  id: string;
  opportunity_id: string;
  amount_cents: number;
  currency: string;
  description: string | null;
  status: ProposalStatus;
  valid_until: string | null;
  sent_at: string | null;
  created_at: string;
};

export type Booking = {
  id: string;
  contact_id: string;
  contact_name: string;
  opportunity_id: string | null;
  package_id: string | null;
  package_name: string | null;
  departure_id: string | null;
  departure_date: string | null;
  travelers: number;
  total_cents: number;
  currency: string;
  status: BookingStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  amount_paid_cents: number;
  payment_notes: string | null;
  created_at: string;
};

export type Task = {
  id: string;
  title: string;
  notes: string | null;
  due_at: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  contact_id: string | null;
  contact_name: string | null;
  opportunity_id: string | null;
  done_at: string | null;
  origin: "manual" | "automation";
};

export type Option = { id: string; name: string };
