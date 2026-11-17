import { FileText, MessageCircle, Search, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button, LinkButton } from "@/components/ui/button";
import { DataList, type DataColumn } from "@/components/ui/data-list";
import { Badge, Card, CardHeader, EmptyState, type BadgeTone } from "@/components/ui/primitives";
import { requireCapabilityPage } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";
import { SyncTemplatesButton } from "@/modules/channels/components/channel-forms";
import {
  listChannels,
  listTemplates,
  TEMPLATE_CATEGORY_LABELS,
  TEMPLATE_STATUS_LABELS,
  type Channel,
  type Template,
} from "@/modules/channels/queries";

export const metadata: Metadata = { title: "Modelos de mensagem" };

/** Tom do selo conforme a situação informada pela Meta (nunca inferida pelo sistema). */
const STATUS_TONES: Record<string, BadgeTone> = {
  APPROVED: "brand",
  PENDING: "warning",
  IN_APPEAL: "warning",
  REJECTED: "danger",
  DISABLED: "danger",
  LIMIT_EXCEEDED: "danger",
  PAUSED: "neutral",
};

function channelName(channel: Channel): string {
  return channel.display_phone ?? channel.verified_name ?? `Número ${channel.phone_number_id}`;
}

type SearchParams = { q?: string; categoria?: string; situacao?: string };

export default async function ModelosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { supabase, membership } = await requireCapabilityPage("automations.manage");
  const orgId = membership.organization.id;
  const tz = membership.organization.timezone;
  const canChannels = can(membership.role, "channels.manage");

  const [channels, templates] = await Promise.all([listChannels(supabase, orgId), listTemplates(supabase, orgId)]);
  const active = channels.filter((c) => c.status !== "disconnected");
  const channelById = new Map(channels.map((c) => [c.id, c]));

  // Opções dos filtros: rótulos conhecidos + qualquer valor que a Meta tenha devolvido.
  const categories = Array.from(new Set([...Object.keys(TEMPLATE_CATEGORY_LABELS), ...templates.map((t) => t.category)]));
  const statuses = Array.from(new Set([...Object.keys(TEMPLATE_STATUS_LABELS), ...templates.map((t) => t.status)]));

  const q = (params.q ?? "").trim().slice(0, 100);
  const categoria = params.categoria && categories.includes(params.categoria) ? params.categoria : "";
  const situacao = params.situacao && statuses.includes(params.situacao) ? params.situacao : "";
  const filtering = Boolean(q || categoria || situacao);

  const needle = q.toLocaleLowerCase("pt-BR");
  const filtered = templates.filter(
    (t) =>
      (!needle || t.name.toLocaleLowerCase("pt-BR").includes(needle)) &&
      (!categoria || t.category === categoria) &&
      (!situacao || t.status === situacao),
  );

  const lastSync = active
    .map((c) => c.templates_synced_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  const syncButtons =
    active.length > 0 ? (
      <div className="flex flex-wrap gap-2">
        {active.map((channel) => (
          <SyncTemplatesButton
            key={channel.id}
            channelId={channel.id}
            channelLabel={active.length > 1 ? channelName(channel) : undefined}
          />
        ))}
      </div>
    ) : null;

  if (active.length === 0) {
    return (
      <Card className="max-w-5xl">
        <EmptyState
          icon={MessageCircle}
          title="Nenhum canal de WhatsApp conectado"
          description={
            canChannels
              ? "Os modelos de mensagem vêm da conta do WhatsApp Business na Meta. Conecte um número para sincronizá-los."
              : "Os modelos de mensagem vêm da conta do WhatsApp Business na Meta. Peça a um administrador para conectar um número."
          }
          action={
            canChannels ? (
              <LinkButton href="/configuracoes/canais" variant="primary">
                Ir para Canais
              </LinkButton>
            ) : null
          }
        />
      </Card>
    );
  }

  const columns: DataColumn<Template>[] = [
    { key: "name", header: "Nome", primary: true, cell: (t) => <span className="font-medium break-all">{t.name}</span> },
    { key: "language", header: "Idioma", className: "whitespace-nowrap", cell: (t) => t.language },
    { key: "category", header: "Categoria", cell: (t) => TEMPLATE_CATEGORY_LABELS[t.category] ?? t.category },
    {
      key: "status",
      header: "Situação na Meta",
      cell: (t) => <Badge tone={STATUS_TONES[t.status] ?? "neutral"}>{TEMPLATE_STATUS_LABELS[t.status] ?? t.status}</Badge>,
    },
  ];
  if (channels.length > 1) {
    columns.push({
      key: "channel",
      header: "Canal",
      className: "whitespace-nowrap",
      cell: (t) => {
        const channel = channelById.get(t.channel_id);
        return channel ? channelName(channel) : "Canal removido";
      },
    });
  }
  columns.push({
    key: "usage",
    header: "Uso no sistema",
    className: "text-label text-fg-muted",
    cell: (t) => {
      if (channelById.get(t.channel_id)?.status === "disconnected") return "Canal desconectado";
      if (!t.spec.supported) return t.spec.reason;
      // A disponibilidade depende da situação informada pela Meta, nunca de inferência do sistema.
      return t.status === "APPROVED" ? "Disponível para envio" : "Só pode ser enviado depois de aprovado pela Meta";
    },
  });

  return (
    <Card className="max-w-5xl overflow-hidden">
      <CardHeader
        title="Modelos de mensagem"
        description="Criados e aprovados no Gerenciador do WhatsApp da Meta. Fora da janela de 24 horas, só modelos aprovados podem ser enviados."
        action={syncButtons}
      />

      {templates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum modelo sincronizado"
          description="Crie modelos no Gerenciador do WhatsApp da Meta e use Sincronizar templates para trazê-los para cá."
          className="py-10"
        />
      ) : (
        <>
          <form method="get" role="search" aria-label="Filtrar modelos" className="flex flex-wrap items-end gap-2 border-b border-line p-4">
            <div className="relative w-full sm:w-auto sm:min-w-64 sm:flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Buscar por nome"
                aria-label="Buscar modelo por nome"
                maxLength={100}
                className="elz-field pl-9 max-md:min-h-touch"
              />
            </div>
            <select
              name="categoria"
              defaultValue={categoria}
              aria-label="Filtrar por categoria"
              className="elz-field w-full max-md:min-h-touch sm:w-auto sm:min-w-44"
            >
              <option value="">Todas as categorias</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {TEMPLATE_CATEGORY_LABELS[value] ?? value}
                </option>
              ))}
            </select>
            <select
              name="situacao"
              defaultValue={situacao}
              aria-label="Filtrar por situação na Meta"
              className="elz-field w-full max-md:min-h-touch sm:w-auto sm:min-w-44"
            >
              <option value="">Todas as situações</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {TEMPLATE_STATUS_LABELS[value] ?? value}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button type="submit" variant="secondary" className="max-md:min-h-touch">
                Filtrar
              </Button>
              {filtering ? (
                <LinkButton href="/configuracoes/modelos" variant="ghost" className="max-md:min-h-touch">
                  Limpar
                </LinkButton>
              ) : null}
            </div>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-label text-fg-muted">
            <p aria-live="polite">
              {filtering
                ? `${filtered.length} de ${templates.length} ${templates.length === 1 ? "modelo" : "modelos"}`
                : `${templates.length} ${templates.length === 1 ? "modelo" : "modelos"}`}
            </p>
            {lastSync ? <p>Última sincronização: {formatDateTime(lastSync, tz)}</p> : null}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="Nenhum modelo encontrado"
              description="Nenhum modelo corresponde aos filtros escolhidos."
              action={
                <Link href="/configuracoes/modelos" className="text-body font-semibold text-brand-strong underline-offset-4 hover:underline">
                  Limpar filtros
                </Link>
              }
              className="border-t border-line py-10"
            />
          ) : (
            <div className="border-t border-line">
              <DataList columns={columns} rows={filtered} getKey={(t) => t.id} caption="Modelos de mensagem" />
            </div>
          )}
        </>
      )}
    </Card>
  );
}
