import { AlertCircle, ArrowLeft, Check, CheckCheck, Clock, FileText, Info, MessagesSquare, Search, SlidersHorizontal, StickyNote } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button, LinkButton } from "@/components/ui/button";
import { Avatar, Badge, EmptyState, TagChip, type BadgeTone } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { can, isManager } from "@/lib/permissions";
import { cn, formatDateTime, formatMoney, formatPhone, formatRelative, formatTime } from "@/lib/utils";
import { serviceWindow } from "@/lib/whatsapp/webhook";
import { signedUrls } from "@/modules/catalog/queries";
import { listChannels, listTemplates } from "@/modules/channels/queries";
import { listTags } from "@/modules/contacts/queries";
import { CONSENT_LABELS } from "@/modules/crm/types";
import { retryMediaAction, retryMessageAction } from "@/modules/inbox/actions";
import { Composer } from "@/modules/inbox/components/composer";
import { ConversationActions } from "@/modules/inbox/components/conversation-actions";
import { CustomerPanel } from "@/modules/inbox/components/customer-panel";
import { RealtimeRefresher, RetryButton, Thread } from "@/modules/inbox/components/live";
import {
  CONVERSATION_STATUS_LABELS,
  countPending,
  getConversation,
  listConversationEvents,
  listConversations,
  listMessages,
  MESSAGES_PAGE,
  type ConversationStatus,
  type InboxFilters,
  type Message,
} from "@/modules/inbox/queries";
import { listOpportunitiesByContact, listStages } from "@/modules/pipeline/queries";
import { listActiveMembers, listTeams } from "@/modules/settings/queries";

export const metadata: Metadata = { title: "Atendimentos" };

type SearchParams = { aba?: string; conversa?: string; q?: string; status?: string; atendente?: string; etiqueta?: string; limite?: string; painel?: string };

const EVENT_LABELS: Record<string, string> = {
  created: "Conversa iniciada",
  assumed: "Atendimento assumido",
  transferred: "Atendimento transferido",
  closed: "Atendimento concluído",
  reopened: "Atendimento reaberto",
};

const STATUS_TONES: Record<ConversationStatus, BadgeTone> = { pending: "warning", open: "progress", closed: "neutral" };

/**
 * A central ocupa exatamente a área abaixo da barra superior: posição fixa
 * entre `top-header` (altura do cabeçalho) e o rodapé da janela. Assim não há
 * cálculo arbitrário de altura e a página não rola; cada coluna rola sozinha.
 */
const FRAME = "fixed inset-x-0 top-header bottom-0 flex bg-bg";

function StatusIcon({ message }: { message: Message }) {
  if (message.direction === "in" || message.type === "note") return null;
  const map = {
    queued: [Clock, "Na fila", ""],
    sent: [Check, "Enviada", ""],
    delivered: [CheckCheck, "Entregue", ""],
    read: [CheckCheck, "Lida", "text-brand"],
    failed: [AlertCircle, "Falhou", "text-danger"],
  } as const;
  const entry = map[message.status as keyof typeof map];
  if (!entry) return null;
  const [Icon, label, color] = entry;
  return <Icon className={cn("h-3.5 w-3.5", color)} role="img" aria-label={label} />;
}

function MessageBubble({ message, mediaUrl, timeZone }: { message: Message; mediaUrl: string | null; timeZone: string }) {
  const isNote = message.type === "note";
  const out = message.direction === "out";
  const hasMedia = ["image", "audio", "document", "video"].includes(message.type);

  return (
    <li className={cn("flex", isNote ? "justify-center" : out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-xs min-w-0 px-3.5 py-2 text-body sm:max-w-sm lg:max-w-md 2xl:max-w-lg",
          isNote
            ? "w-full rounded-lg border border-dashed border-warning/40 bg-warning-soft text-fg sm:w-auto"
            : out
              ? "rounded-xl rounded-br-sm bg-ink text-white shadow-card"
              : "rounded-xl rounded-bl-sm border border-line bg-surface text-fg shadow-card",
        )}
      >
        {isNote ? (
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-warning">
            <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
            Nota interna{message.sender_name ? ` · ${message.sender_name}` : ""}
          </p>
        ) : null}
        {message.type === "template" ? (
          <p className="mb-1 text-xs font-semibold opacity-70">
            Template {message.template_name}
            {message.origin !== "manual" ? ` · ${message.origin === "campaign" ? "campanha" : "automação"}` : ""}
          </p>
        ) : null}

        {hasMedia ? (
          mediaUrl ? (
            message.type === "image" ? (
              <a href={mediaUrl} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do bucket privado */}
                <img src={mediaUrl} alt={message.body ?? "Imagem da conversa"} className="mb-1 max-h-72 max-w-full rounded-md object-contain" loading="lazy" />
              </a>
            ) : message.type === "audio" ? (
              <audio controls preload="none" src={mediaUrl} className="mb-1 w-64 max-w-full">
                <a href={mediaUrl}>Baixar áudio</a>
              </audio>
            ) : message.type === "video" ? (
              <video controls preload="none" src={mediaUrl} className="mb-1 max-h-72 max-w-full rounded-md" />
            ) : (
              <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="mb-1 flex items-center gap-2 font-semibold underline underline-offset-2">
                <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-all">{message.media_name ?? "Documento"}</span>
              </a>
            )
          ) : (
            <div className="mb-1 space-y-1 text-label opacity-90">
              <p>{message.media_status === "pending" ? "Mídia recebida, download em andamento." : "Não foi possível baixar esta mídia."}</p>
              {message.direction === "in" ? <RetryButton action={retryMediaAction.bind(null, message.id)} label="Tentar baixar novamente" /> : null}
            </div>
          )
        ) : null}

        {message.body ? <p className="break-words whitespace-pre-wrap">{message.body}</p> : null}

        {message.status === "failed" ? (
          <div className="mt-1.5 space-y-1 rounded-sm bg-danger-soft px-2 py-1.5 text-xs text-danger">
            <p>{message.error_message ?? "O envio falhou."}</p>
            <RetryButton action={retryMessageAction.bind(null, message.id)} label="Tentar novamente" />
          </div>
        ) : null}

        <p className={cn("mt-1 flex items-center justify-end gap-1 text-caption", out && !isNote ? "text-white/70" : "text-fg-subtle")}>
          {!isNote && out && message.sender_name ? <span className="truncate">{message.sender_name} ·</span> : null}
          <time dateTime={message.created_at}>{formatTime(message.created_at, timeZone)}</time>
          <StatusIcon message={message} />
        </p>
      </div>
    </li>
  );
}

function PanelSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-2.5 px-5 py-4">
      <h2 id={id} className="text-caption font-bold tracking-wide text-fg-subtle uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function AtendimentosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { supabase, membership, user } = await requireMembership();
  const orgId = membership.organization.id;
  const tz = membership.organization.timezone;

  const channels = await listChannels(supabase, orgId);
  if (channels.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          icon={MessagesSquare}
          title="Nenhum número de WhatsApp conectado"
          description={
            can(membership.role, "channels.manage")
              ? "Conecte o número da agência pela API oficial da Meta para receber e responder conversas aqui."
              : "Um proprietário ou administrador precisa conectar o número da agência em Configurações › Canais."
          }
          action={can(membership.role, "channels.manage") ? <LinkButton href="/configuracoes/canais">Conectar WhatsApp</LinkButton> : undefined}
        />
      </div>
    );
  }

  const tab: InboxFilters["tab"] = params.aba === "minhas" || params.aba === "todas" ? params.aba : "pendentes";
  const filters: InboxFilters = { tab, q: params.q, status: params.status, assignee: params.atendente, tag: params.etiqueta };
  const limit = Math.min(2000, Math.max(MESSAGES_PAGE, Number(params.limite) || MESSAGES_PAGE));

  const [conversations, pendingCount, members, teams, tags, selected] = await Promise.all([
    listConversations(supabase, orgId, user.id, filters),
    countPending(supabase, orgId),
    listActiveMembers(supabase, orgId),
    listTeams(supabase, orgId),
    listTags(supabase, orgId),
    getConversation(supabase, orgId, params.conversa),
  ]);
  const memberName = new Map(members.map((m) => [m.id, m.name]));

  const [thread, events, opportunities, stages, templates] = selected
    ? await Promise.all([
        listMessages(supabase, orgId, selected.id, limit),
        listConversationEvents(supabase, orgId, selected.id),
        listOpportunitiesByContact(supabase, orgId, selected.contact.id, members),
        listStages(supabase, orgId),
        listTemplates(supabase, orgId, { approvedOnly: true, channelId: selected.channel_id }),
      ])
    : [null, [], [], [], []];
  const mediaUrls = thread ? await signedUrls(supabase, thread.messages.map((m) => m.media_path).filter((p): p is string => p !== null && p !== ""), 900) : new Map<string, string>();

  const link = (changes: Partial<SearchParams>) => {
    const next = new URLSearchParams();
    const merged = { aba: tab, q: params.q, status: params.status, atendente: params.atendente, etiqueta: params.etiqueta, conversa: params.conversa, ...changes };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    return `/atendimentos?${next.toString()}`;
  };

  const window = selected ? serviceWindow(selected.last_inbound_at) : null;
  const canHandle = selected ? isManager(membership.role) || selected.assignee_id === null || selected.assignee_id === user.id : false;
  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const openOpps = opportunities.filter((o) => o.status === "open");
  const showPanel = params.painel === "1";
  const filtered = Boolean(params.q || params.status || params.atendente || params.etiqueta);
  const advancedFilters = Boolean(params.status || params.atendente || params.etiqueta);

  return (
    <div className={FRAME}>
      <RealtimeRefresher organizationId={orgId} />

      {/* ESQUERDA: lista de conversas */}
      <aside
        className={cn("min-h-0 w-full shrink-0 flex-col border-r border-line bg-surface md:flex md:w-72 lg:w-80 xl:w-inbox-list", selected ? "hidden" : "flex")}
        aria-label="Conversas"
      >
        <div className="border-b border-line px-3 pt-3 sm:px-4">
          <h1 className="mb-2 text-title font-bold text-fg">Atendimentos</h1>
          <nav aria-label="Filas de atendimento" className="-mb-px flex">
            {(
              [
                ["pendentes", "Pendentes", pendingCount],
                ["minhas", "Minhas", null],
                ["todas", "Todas", null],
              ] as const
            ).map(([value, label, count]) => (
              <Link
                key={value}
                href={link({ aba: value, conversa: undefined, status: undefined })}
                aria-current={tab === value ? "page" : undefined}
                className={cn(
                  "flex min-h-touch flex-1 items-center justify-center gap-1.5 border-b-2 px-2 text-label font-semibold transition-colors md:min-h-10",
                  tab === value ? "border-ink text-fg" : "border-transparent text-fg-muted hover:text-fg",
                )}
              >
                {label}
                {count ? (
                  <span className="rounded-full bg-brand px-1.5 text-caption font-bold text-ink tabular-nums" aria-label={`${count} pendentes`}>
                    {count}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
        </div>

        <form method="get" className="space-y-2 border-b border-line p-3 sm:px-4" role="search">
          <input type="hidden" name="aba" value={tab} />
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
            <input type="search" name="q" defaultValue={params.q ?? ""} placeholder="Buscar contato" aria-label="Buscar por contato" className="elz-field min-h-touch pl-9 md:min-h-10" />
          </div>
          <details open={advancedFilters}>
            <summary className="flex min-h-touch cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-fg-muted hover:text-fg md:min-h-8">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              Filtros
              {advancedFilters ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
                  <span className="sr-only">(ativos)</span>
                </>
              ) : null}
            </summary>
            <div className="mt-1 grid gap-2">
              {tab === "todas" ? (
                <select name="status" defaultValue={params.status ?? ""} aria-label="Filtrar por status" className="elz-field">
                  <option value="">Todos os status</option>
                  {Object.entries(CONVERSATION_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : null}
              {tab !== "minhas" ? (
                <select name="atendente" defaultValue={params.atendente ?? ""} aria-label="Filtrar por atendente" className="elz-field">
                  <option value="">Todos os atendentes</option>
                  <option value="nenhum">Sem atendente</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <select name="etiqueta" defaultValue={params.etiqueta ?? ""} aria-label="Filtrar por etiqueta" className="elz-field">
                <option value="">Todas as etiquetas</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </details>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" size="sm" className="max-md:h-touch max-md:flex-1">
              Aplicar
            </Button>
            {filtered ? (
              <LinkButton href={`/atendimentos?aba=${tab}`} variant="ghost" size="sm" className="max-md:h-touch">
                Limpar
              </LinkButton>
            ) : null}
          </div>
        </form>

        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {conversations.length === 0 ? (
            <li>
              <EmptyState
                icon={MessagesSquare}
                title={filtered ? "Nenhuma conversa encontrada" : tab === "pendentes" ? "Nenhuma conversa pendente" : tab === "minhas" ? "Você não tem conversas em andamento" : "Nenhuma conversa"}
                description={filtered ? "Ajuste a busca ou os filtros." : "As conversas aparecem aqui quando os clientes escrevem para o número da agência."}
                className="py-10"
              />
            </li>
          ) : null}
          {conversations.map((c) => {
            const active = selected?.id === c.id;
            const unread = c.unread_count > 0;
            return (
              <li key={c.id} className="border-b border-line">
                <Link
                  href={link({ conversa: c.id, limite: undefined, painel: undefined })}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex gap-3 border-l-4 py-3 pr-3 pl-2 transition-colors duration-150 sm:pr-4 sm:pl-3",
                    active ? "border-l-brand bg-muted" : "border-l-transparent hover:bg-hover",
                  )}
                >
                  <span className="relative shrink-0">
                    <Avatar name={c.contact_name} size={40} />
                    {unread ? <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-brand" aria-hidden="true" /> : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={cn("truncate text-body", unread ? "font-bold text-fg" : "font-semibold text-fg")}>{c.contact_name}</p>
                      <span className={cn("shrink-0 text-caption tabular-nums", unread ? "font-semibold text-brand-strong" : "text-fg-subtle")}>{formatRelative(c.last_message_at)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className={cn("min-w-0 flex-1 truncate text-label", unread ? "font-medium text-fg" : "text-fg-muted")}>{c.last_message_preview ?? "Sem mensagens"}</p>
                      {unread ? (
                        <span className="shrink-0 rounded-full bg-brand px-1.5 text-caption font-bold text-ink tabular-nums" aria-label={`${c.unread_count} não lidas`}>
                          {c.unread_count}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                      <Badge tone={STATUS_TONES[c.status]}>{CONVERSATION_STATUS_LABELS[c.status]}</Badge>
                      <span className="truncate text-caption text-fg-subtle">{c.assignee_id ? (memberName.get(c.assignee_id) ?? "Atendente") : "Sem atendente"}</span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* CENTRO: histórico e envio */}
      <section className={cn("min-h-0 min-w-0 flex-1 flex-col", selected ? "flex" : "hidden md:flex")} aria-label="Conversa">
        {!selected || !thread ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState icon={MessagesSquare} title="Selecione uma conversa" description="Escolha uma conversa na lista para ver o histórico e responder." />
          </div>
        ) : (
          <>
            <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-2 py-2 sm:px-4 sm:py-2.5">
              <Link
                href={link({ conversa: undefined, painel: undefined })}
                aria-label="Voltar para a lista"
                className="inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-hover hover:text-fg md:hidden"
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </Link>
              <Avatar name={selected.contact.name} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-title font-bold">{selected.contact.name}</p>
                <p className="flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
                  {/* No celular o selo vem nesta linha, para o nome ter a largura toda. */}
                  <Badge tone={STATUS_TONES[selected.status]} className="shrink-0 sm:hidden">
                    {CONVERSATION_STATUS_LABELS[selected.status]}
                  </Badge>
                  <span className="truncate">{formatPhone(selected.contact.phone_e164)}</span>
                  <span aria-hidden="true" className="max-sm:hidden">·</span>
                  <span className="truncate max-sm:hidden">
                    {selected.assignee_id ? (memberName.get(selected.assignee_id) ?? "Atendente") : "sem atendente"}
                  </span>
                </p>
              </div>
              <Badge tone={STATUS_TONES[selected.status]} className="shrink-0 max-sm:hidden">
                {CONVERSATION_STATUS_LABELS[selected.status]}
              </Badge>
              <LinkButton
                href={link({ painel: showPanel ? undefined : "1" })}
                scroll={false}
                variant="ghost"
                size="icon"
                aria-label="Informações do cliente"
                aria-expanded={showPanel}
                className="max-md:h-touch max-md:w-touch xl:hidden"
              >
                <Info className="h-5 w-5" aria-hidden="true" />
              </LinkButton>
              <div className="order-last w-full lg:order-none lg:w-auto">
                <ConversationActions
                  conversationId={selected.id}
                  status={selected.status}
                  assigneeId={selected.assignee_id}
                  currentUserId={user.id}
                  canHandle={canHandle}
                  members={members}
                  teams={teams.map((t) => ({ id: t.id, name: t.name }))}
                />
              </div>
            </header>

            <Thread conversationId={selected.id} lastMessageId={thread.messages.at(-1)?.id ?? null} unread={selected.unread_count}>
              {thread.hasMore ? (
                <div className="mb-4 text-center">
                  <LinkButton href={link({ limite: String(limit + 200) })} variant="secondary" size="sm" className="max-md:h-touch">
                    Ver mensagens anteriores
                  </LinkButton>
                </div>
              ) : null}
              {thread.messages.length === 0 ? (
                <p className="py-10 text-center text-body text-fg-muted">Nenhuma mensagem nesta conversa ainda.</p>
              ) : (
                <ol className="mx-auto max-w-4xl space-y-2">
                  {thread.messages.map((m) => (
                    <MessageBubble key={m.id} message={m} mediaUrl={m.media_path ? (mediaUrls.get(m.media_path) ?? null) : null} timeZone={tz} />
                  ))}
                </ol>
              )}
            </Thread>

            <div className="shrink-0">
              <Composer
                key={selected.id}
                conversationId={selected.id}
                organizationId={orgId}
                windowOpen={window?.open ?? false}
                windowExpiresAt={window?.expiresAt ?? null}
                timeLabel={window?.open && window.expiresAt ? formatDateTime(window.expiresAt, tz) : null}
                templates={templates}
                channelConnected={selected.channel_status === "connected"}
                blockedReason={canHandle ? null : `Esta conversa está com ${memberName.get(selected.assignee_id ?? "") ?? "outro atendente"}. Você pode registrar notas internas; para responder, peça a transferência.`}
              />
            </div>
          </>
        )}
      </section>

      {/* DIREITA: cliente e contexto comercial (coluna em xl+, gaveta abaixo disso) */}
      {selected ? (
        <CustomerPanel open={showPanel} closeHref={link({ painel: undefined })}>
          <div className="divide-y divide-line">
            <section aria-labelledby="painel-cliente" className="flex flex-col items-center gap-2 px-5 py-6 text-center">
              <Avatar name={selected.contact.name} size={56} />
              <div className="min-w-0">
                <h2 id="painel-cliente" className="text-title font-bold break-words">
                  {selected.contact.name}
                </h2>
                <p className="text-label text-fg-muted">{formatPhone(selected.contact.phone_e164)}</p>
                {selected.contact.email ? <p className="text-label break-all text-fg-muted">{selected.contact.email}</p> : null}
              </div>
              <Badge tone={selected.contact.marketing_consent === "granted" ? "won" : selected.contact.marketing_consent === "revoked" ? "danger" : "neutral"}>
                {CONSENT_LABELS[selected.contact.marketing_consent]}
              </Badge>
              <LinkButton href={`/contatos/${selected.contact.id}`} variant="secondary" size="sm" className="mt-1 max-md:h-touch">
                Abrir ficha do contato
              </LinkButton>
            </section>

            <PanelSection id="painel-etiquetas" title="Etiquetas">
              {selected.contact.tags.length === 0 ? (
                <p className="text-label text-fg-subtle">Sem etiquetas. Edite o contato para adicionar.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {selected.contact.tags.map((t) => (
                    <TagChip key={t.id} name={t.name} color={t.color} />
                  ))}
                </div>
              )}
            </PanelSection>

            <PanelSection id="painel-responsavel" title="Responsável">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-label">
                <dt className="text-fg-muted">Atendimento</dt>
                <dd className="truncate font-semibold">{selected.assignee_id ? (memberName.get(selected.assignee_id) ?? "—") : "sem atendente"}</dd>
                {selected.team_id ? (
                  <>
                    <dt className="text-fg-muted">Equipe</dt>
                    <dd className="truncate font-semibold">{teams.find((t) => t.id === selected.team_id)?.name ?? "—"}</dd>
                  </>
                ) : null}
                <dt className="text-fg-muted">Comercial</dt>
                <dd className="truncate font-semibold">{selected.contact.owner_id ? (memberName.get(selected.contact.owner_id) ?? "—") : "sem responsável"}</dd>
              </dl>
            </PanelSection>

            <PanelSection id="painel-oportunidades" title="Oportunidades">
              {opportunities.length === 0 ? (
                <p className="text-label text-fg-subtle">Nenhuma oportunidade para este contato.</p>
              ) : (
                <ul className="space-y-2">
                  {opportunities.slice(0, 5).map((o) => (
                    <li key={o.id}>
                      <Link href={`/funil/${o.id}`} className="block rounded-md border border-line p-3 transition-colors hover:border-line-strong hover:bg-hover">
                        <span className="block truncate text-label font-semibold">{o.package_name ?? o.destination_interest ?? "Sem destino definido"}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                          <Badge tone={o.status === "won" ? "won" : o.status === "lost" ? "lost" : "progress"}>{stageName.get(o.stage_id) ?? "—"}</Badge>
                          <span className="tabular-nums">{formatMoney(o.estimated_value_cents, o.currency)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                <LinkButton href={`/funil?contato=${selected.contact.id}`} variant="secondary" size="sm" className="max-md:h-touch">
                  Nova oportunidade
                </LinkButton>
                <LinkButton href="/funil" variant="ghost" size="sm" className="max-md:h-touch">
                  Abrir funil
                </LinkButton>
              </div>
            </PanelSection>

            <PanelSection id="painel-viagem" title="Viagem de interesse">
              {openOpps.length === 0 ? (
                <p className="text-label text-fg-subtle">Nenhuma viagem em negociação.</p>
              ) : (
                <ul className="space-y-1.5 text-label">
                  {openOpps.map((o) => (
                    <li key={o.id}>
                      {o.package_id ? (
                        <Link href={`/viagens/${o.package_id}`} className="font-semibold hover:underline">
                          {o.package_name}
                        </Link>
                      ) : (
                        <span className="font-semibold">{o.destination_interest ?? "Destino não definido"}</span>
                      )}
                      {o.departure_date || o.intended_date ? <span className="text-fg-muted"> · {(o.departure_date ?? o.intended_date)!.split("-").reverse().join("/")}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </PanelSection>

            <PanelSection id="painel-historico" title="Histórico do atendimento">
              {events.length === 0 ? (
                <p className="text-label text-fg-subtle">Nenhum evento registrado.</p>
              ) : (
                <ol className="space-y-3 border-l border-line pl-4">
                  {events.map((e) => (
                    <li key={e.id} className="relative text-label">
                      <span className="absolute top-1.5 -left-5.25 h-2 w-2 rounded-full bg-line-strong" aria-hidden="true" />
                      <p className="font-medium">
                        {EVENT_LABELS[e.type] ?? e.type}
                        {e.type === "transferred" && typeof e.metadata.to === "string" ? ` para ${memberName.get(e.metadata.to) ?? "atendente"}` : ""}
                        {e.type === "reopened" && e.metadata.by === "contact" ? " pelo cliente" : ""}
                      </p>
                      <p className="text-xs text-fg-subtle">
                        {formatDateTime(e.created_at, tz)}
                        {e.actor_name ? ` · ${e.actor_name}` : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </PanelSection>
          </div>
        </CustomerPanel>
      ) : null}
    </div>
  );
}
