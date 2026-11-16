import { AlertCircle, ArrowLeft, Check, CheckCheck, Clock, FileText, Info, MessagesSquare, Search, StickyNote } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button, LinkButton } from "@/components/ui/button";
import { Avatar, Badge, EmptyState, TagChip } from "@/components/ui/primitives";
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
import { RealtimeRefresher, RetryButton, Thread } from "@/modules/inbox/components/live";
import {
  CONVERSATION_STATUS_LABELS,
  countPending,
  getConversation,
  listConversationEvents,
  listConversations,
  listMessages,
  MESSAGES_PAGE,
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
  return <Icon className={cn("h-3.5 w-3.5", color)} aria-label={label} />;
}

function MessageBubble({ message, mediaUrl, timeZone }: { message: Message; mediaUrl: string | null; timeZone: string }) {
  const isNote = message.type === "note";
  const out = message.direction === "out";
  const hasMedia = ["image", "audio", "document", "video"].includes(message.type);

  return (
    <li className={cn("flex", isNote ? "justify-center" : out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-card sm:max-w-[70%]",
          isNote ? "border border-warning/25 bg-warning-soft text-fg" : out ? "bg-ink text-white" : "border border-line bg-surface text-fg",
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
                <img src={mediaUrl} alt={message.body ?? "Imagem da conversa"} className="mb-1 max-h-72 rounded-md object-contain" loading="lazy" />
              </a>
            ) : message.type === "audio" ? (
              <audio controls preload="none" src={mediaUrl} className="mb-1 w-64 max-w-full">
                <a href={mediaUrl}>Baixar áudio</a>
              </audio>
            ) : message.type === "video" ? (
              <video controls preload="none" src={mediaUrl} className="mb-1 max-h-72 rounded-md" />
            ) : (
              <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="mb-1 flex items-center gap-2 font-semibold underline underline-offset-2">
                <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-all">{message.media_name ?? "Documento"}</span>
              </a>
            )
          ) : (
            <div className="mb-1 space-y-1 text-[13px] opacity-90">
              <p>{message.media_status === "pending" ? "Mídia recebida, download em andamento." : "Não foi possível baixar esta mídia."}</p>
              {message.direction === "in" ? <RetryButton action={retryMediaAction.bind(null, message.id)} label="Tentar baixar novamente" /> : null}
            </div>
          )
        ) : null}

        {message.body ? <p className="break-words whitespace-pre-wrap">{message.body}</p> : null}

        {message.status === "failed" ? (
          <div className="mt-1.5 space-y-1 rounded bg-danger-soft px-2 py-1.5 text-xs text-danger">
            <p>{message.error_message ?? "O envio falhou."}</p>
            <RetryButton action={retryMessageAction.bind(null, message.id)} label="Tentar novamente" />
          </div>
        ) : null}

        <p className={cn("mt-1 flex items-center justify-end gap-1 text-[11px]", out && !isNote ? "text-white/70" : "text-fg-subtle")}>
          {!isNote && out && message.sender_name ? <span>{message.sender_name} ·</span> : null}
          <time dateTime={message.created_at}>{formatTime(message.created_at, timeZone)}</time>
          <StatusIcon message={message} />
        </p>
      </div>
    </li>
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

  return (
    <div className="flex h-[calc(100dvh-var(--elz-header-height))]">
      <RealtimeRefresher organizationId={orgId} />

      {/* ESQUERDA: lista de conversas */}
      <aside className={cn("w-full shrink-0 flex-col border-r border-line bg-surface md:flex md:w-80 xl:w-[340px]", selected ? "hidden" : "flex")} aria-label="Conversas">
        <nav aria-label="Filas de atendimento" className="flex border-b border-line">
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
                "-mb-px flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-3 text-[13px] font-semibold",
                tab === value ? "border-ink text-fg" : "border-transparent text-fg-muted hover:text-fg",
              )}
            >
              {label}
              {count ? <span className="rounded-full bg-brand px-1.5 text-xs text-ink">{count}</span> : null}
            </Link>
          ))}
        </nav>
        <form method="get" className="space-y-2 border-b border-line p-3" role="search">
          <input type="hidden" name="aba" value={tab} />
          <div className="relative">
            <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-fg-subtle" aria-hidden="true" />
            <input name="q" defaultValue={params.q ?? ""} placeholder="Buscar contato" aria-label="Buscar por contato" className="elz-field pl-9" />
          </div>
          <details open={Boolean(params.status || params.atendente || params.etiqueta)}>
            <summary className="cursor-pointer text-xs font-semibold text-fg-muted">Filtros</summary>
            <div className="mt-2 grid gap-2">
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
            <Button type="submit" variant="secondary" size="sm">
              Aplicar
            </Button>
            {filtered ? (
              <LinkButton href={`/atendimentos?aba=${tab}`} variant="ghost" size="sm">
                Limpar
              </LinkButton>
            ) : null}
          </div>
        </form>

        <ul className="flex-1 overflow-y-auto">
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
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={link({ conversa: c.id, limite: undefined, painel: undefined })}
                aria-current={selected?.id === c.id ? "true" : undefined}
                className={cn("flex gap-3 border-b border-line px-3 py-3 hover:bg-muted", selected?.id === c.id && "bg-muted")}
              >
                <Avatar name={c.contact_name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={cn("truncate text-sm", c.unread_count > 0 ? "font-bold" : "font-semibold")}>{c.contact_name}</p>
                    <span className="shrink-0 text-[11px] text-fg-subtle">{formatRelative(c.last_message_at)}</span>
                  </div>
                  <p className={cn("truncate text-[13px]", c.unread_count > 0 ? "text-fg" : "text-fg-muted")}>{c.last_message_preview ?? "Sem mensagens"}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Badge tone={c.status === "pending" ? "warning" : c.status === "open" ? "info" : "neutral"}>{CONVERSATION_STATUS_LABELS[c.status]}</Badge>
                    <span className="truncate text-[11px] text-fg-subtle">{c.assignee_id ? (memberName.get(c.assignee_id) ?? "Atendente") : "Sem atendente"}</span>
                    {c.unread_count > 0 ? (
                      <span className="ml-auto rounded-full bg-brand px-1.5 text-[11px] font-bold text-ink" aria-label={`${c.unread_count} não lidas`}>
                        {c.unread_count}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      {/* CENTRO: histórico e envio */}
      <section className={cn("min-w-0 flex-1 flex-col", selected ? "flex" : "hidden md:flex")} aria-label="Conversa">
        {!selected || !thread ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState icon={MessagesSquare} title="Selecione uma conversa" description="Escolha uma conversa na lista para ver o histórico e responder." />
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-3 py-2.5 sm:px-4">
              <Link href={link({ conversa: undefined, painel: undefined })} aria-label="Voltar para a lista" className="rounded-md p-1.5 hover:bg-muted md:hidden">
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </Link>
              <Avatar name={selected.contact.name} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{selected.contact.name}</p>
                <p className="truncate text-xs text-fg-muted">
                  {formatPhone(selected.contact.phone_e164)} · {CONVERSATION_STATUS_LABELS[selected.status]}
                  {selected.assignee_id ? ` · ${memberName.get(selected.assignee_id) ?? "Atendente"}` : " · sem atendente"}
                </p>
              </div>
              <ConversationActions
                conversationId={selected.id}
                status={selected.status}
                assigneeId={selected.assignee_id}
                currentUserId={user.id}
                canHandle={canHandle}
                members={members}
                teams={teams.map((t) => ({ id: t.id, name: t.name }))}
              />
              <LinkButton href={link({ painel: showPanel ? undefined : "1" })} variant="ghost" size="icon" aria-label="Informações do cliente" className="xl:hidden">
                <Info className="h-4 w-4" aria-hidden="true" />
              </LinkButton>
            </header>

            <Thread conversationId={selected.id} lastMessageId={thread.messages.at(-1)?.id ?? null} unread={selected.unread_count}>
              {thread.hasMore ? (
                <div className="mb-3 text-center">
                  <LinkButton href={link({ limite: String(limit + 200) })} variant="secondary" size="sm">
                    Ver mensagens anteriores
                  </LinkButton>
                </div>
              ) : null}
              {thread.messages.length === 0 ? (
                <p className="py-10 text-center text-sm text-fg-muted">Nenhuma mensagem nesta conversa ainda.</p>
              ) : (
                <ol className="space-y-2">
                  {thread.messages.map((m) => (
                    <MessageBubble key={m.id} message={m} mediaUrl={m.media_path ? (mediaUrls.get(m.media_path) ?? null) : null} timeZone={tz} />
                  ))}
                </ol>
              )}
            </Thread>

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
          </>
        )}
      </section>

      {/* DIREITA: cliente e contexto comercial */}
      {selected ? (
        <aside
          className={cn("w-full shrink-0 overflow-y-auto border-l border-line bg-surface xl:block xl:w-80", showPanel ? "fixed inset-0 top-[var(--elz-header-height)] z-10 block xl:static" : "hidden")}
          aria-label="Informações do cliente"
        >
          <div className="space-y-5 p-4">
            {showPanel ? (
              <LinkButton href={link({ painel: undefined })} variant="secondary" size="sm" className="xl:hidden">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Voltar para a conversa
              </LinkButton>
            ) : null}
            <section aria-labelledby="painel-cliente" className="space-y-2">
              <h2 id="painel-cliente" className="text-[13px] font-bold text-fg-muted">
                Cliente
              </h2>
              <p className="font-bold">{selected.contact.name}</p>
              <p className="text-sm">{formatPhone(selected.contact.phone_e164)}</p>
              {selected.contact.email ? <p className="text-sm break-all">{selected.contact.email}</p> : null}
              <Badge tone={selected.contact.marketing_consent === "granted" ? "brand" : selected.contact.marketing_consent === "revoked" ? "danger" : "neutral"}>
                {CONSENT_LABELS[selected.contact.marketing_consent]}
              </Badge>
              <div>
                <LinkButton href={`/contatos/${selected.contact.id}`} variant="secondary" size="sm">
                  Abrir ficha do contato
                </LinkButton>
              </div>
            </section>

            <section aria-labelledby="painel-etiquetas" className="space-y-2">
              <h2 id="painel-etiquetas" className="text-[13px] font-bold text-fg-muted">
                Etiquetas
              </h2>
              {selected.contact.tags.length === 0 ? (
                <p className="text-[13px] text-fg-subtle">Sem etiquetas. Edite o contato para adicionar.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {selected.contact.tags.map((t) => (
                    <TagChip key={t.id} name={t.name} color={t.color} />
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="painel-responsavel" className="space-y-1">
              <h2 id="painel-responsavel" className="text-[13px] font-bold text-fg-muted">
                Responsável
              </h2>
              <p className="text-sm">
                Atendimento: <strong>{selected.assignee_id ? (memberName.get(selected.assignee_id) ?? "—") : "sem atendente"}</strong>
              </p>
              {selected.team_id ? (
                <p className="text-sm">
                  Equipe: <strong>{teams.find((t) => t.id === selected.team_id)?.name ?? "—"}</strong>
                </p>
              ) : null}
              <p className="text-sm">
                Comercial: <strong>{selected.contact.owner_id ? (memberName.get(selected.contact.owner_id) ?? "—") : "sem responsável"}</strong>
              </p>
            </section>

            <section aria-labelledby="painel-oportunidades" className="space-y-2">
              <h2 id="painel-oportunidades" className="text-[13px] font-bold text-fg-muted">
                Oportunidades
              </h2>
              {opportunities.length === 0 ? (
                <p className="text-[13px] text-fg-subtle">Nenhuma oportunidade para este contato.</p>
              ) : (
                <ul className="space-y-2">
                  {opportunities.slice(0, 5).map((o) => (
                    <li key={o.id} className="rounded-md border border-line p-2.5">
                      <Link href={`/funil/${o.id}`} className="text-sm font-semibold hover:underline">
                        {o.package_name ?? o.destination_interest ?? "Sem destino definido"}
                      </Link>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                        <Badge tone={o.status === "won" ? "brand" : o.status === "lost" ? "danger" : "info"}>{stageName.get(o.stage_id) ?? "—"}</Badge>
                        {formatMoney(o.estimated_value_cents, o.currency)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                <LinkButton href={`/funil?contato=${selected.contact.id}`} variant="secondary" size="sm">
                  Nova oportunidade
                </LinkButton>
                <LinkButton href="/funil" variant="ghost" size="sm">
                  Abrir funil
                </LinkButton>
              </div>
            </section>

            <section aria-labelledby="painel-viagem" className="space-y-1">
              <h2 id="painel-viagem" className="text-[13px] font-bold text-fg-muted">
                Viagem de interesse
              </h2>
              {openOpps.length === 0 ? (
                <p className="text-[13px] text-fg-subtle">Nenhuma viagem em negociação.</p>
              ) : (
                <ul className="space-y-1 text-sm">
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
            </section>

            <section aria-labelledby="painel-historico" className="space-y-2">
              <h2 id="painel-historico" className="text-[13px] font-bold text-fg-muted">
                Histórico do atendimento
              </h2>
              <ol className="space-y-2">
                {events.map((e) => (
                  <li key={e.id} className="text-[13px]">
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
            </section>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
