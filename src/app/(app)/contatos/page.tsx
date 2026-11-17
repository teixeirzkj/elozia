import { Search, Upload, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button, LinkButton } from "@/components/ui/button";
import { DataList } from "@/components/ui/data-list";
import { Pagination } from "@/components/ui/pagination";
import { Badge, Card, EmptyState, PageHeader, TagChip } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { formatPhone } from "@/lib/utils";
import { ContactDialog } from "@/modules/contacts/components/contact-dialogs";
import { CONTACTS_PAGE_SIZE, listContacts, listTags } from "@/modules/contacts/queries";
import { CONSENT_LABELS, CONTACT_SOURCES } from "@/modules/crm/types";
import { listActiveMembers } from "@/modules/settings/queries";

export const metadata: Metadata = { title: "Contatos" };

type Search = { q?: string; etiqueta?: string; responsavel?: string; origem?: string; consentimento?: string; pagina?: string };

export default async function ContatosPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { supabase, membership } = await requireMembership();
  const orgId = membership.organization.id;

  const [{ contacts, total, page }, tags, members] = await Promise.all([
    listContacts(supabase, orgId, {
      q: params.q,
      tag: params.etiqueta,
      owner: params.responsavel,
      source: params.origem,
      consent: params.consentimento,
      page: Number(params.pagina) || 1,
    }),
    listTags(supabase, orgId),
    listActiveMembers(supabase, orgId),
  ]);
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const filtered = Boolean(params.q || params.etiqueta || params.responsavel || params.origem || params.consentimento);

  return (
    <>
      <PageHeader
        title="Contatos"
        description="Clientes e leads da agência, com histórico, etiquetas e consentimento."
        actions={
          <>
            {can(membership.role, "crm.import") ? (
              <LinkButton href="/contatos/importar" variant="secondary">
                <Upload className="h-4 w-4" aria-hidden="true" />
                Importar CSV
              </LinkButton>
            ) : null}
            <ContactDialog members={members} tags={tags} />
          </>
        }
      />

      <Card className="overflow-hidden">
        <form
          method="get"
          className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(4,1fr)_auto]"
          role="search"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-fg-subtle" aria-hidden="true" />
            <input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Buscar por nome, telefone ou e-mail"
              aria-label="Buscar contatos"
              className="elz-field pl-9"
            />
          </div>
          <select name="etiqueta" defaultValue={params.etiqueta ?? ""} aria-label="Filtrar por etiqueta" className="elz-field">
            <option value="">Todas as etiquetas</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select name="responsavel" defaultValue={params.responsavel ?? ""} aria-label="Filtrar por responsável" className="elz-field">
            <option value="">Todos os responsáveis</option>
            <option value="nenhum">Sem responsável</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select name="origem" defaultValue={params.origem ?? ""} aria-label="Filtrar por origem" className="elz-field">
            <option value="">Todas as origens</option>
            {Object.entries(CONTACT_SOURCES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            name="consentimento"
            defaultValue={params.consentimento ?? ""}
            aria-label="Filtrar por consentimento"
            className="elz-field"
          >
            <option value="">Qualquer consentimento</option>
            {Object.entries(CONSENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary">
              Filtrar
            </Button>
            {filtered ? (
              <LinkButton href="/contatos" variant="ghost">
                Limpar
              </LinkButton>
            ) : null}
          </div>
        </form>

        {contacts.length === 0 ? (
          filtered ? (
            <EmptyState icon={Search} title="Nenhum contato encontrado" description="Ajuste a busca ou limpe os filtros." />
          ) : (
            <EmptyState
              icon={Users}
              title="Nenhum contato cadastrado"
              description="Cadastre o primeiro contato ou importe uma lista em CSV. Contatos também são criados quando alguém escreve para o WhatsApp da agência."
            />
          )
        ) : (
          <>
            <DataList
              caption="Contatos da agência"
              rows={contacts}
              getKey={(c) => c.id}
              columns={[
                {
                  key: "nome",
                  header: "Nome",
                  primary: true,
                  cell: (c) => (
                    <div className="min-w-0">
                      <Link href={`/contatos/${c.id}`} className="font-semibold hover:underline">
                        {c.name}
                      </Link>
                      {c.is_demo ? (
                        <Badge tone="info" className="ml-2">
                          Demonstração
                        </Badge>
                      ) : null}
                      {c.email ? <p className="truncate text-label font-normal text-fg-subtle">{c.email}</p> : null}
                    </div>
                  ),
                },
                { key: "telefone", header: "Telefone", className: "whitespace-nowrap", cell: (c) => formatPhone(c.phone_e164) },
                {
                  key: "etiquetas",
                  header: "Etiquetas",
                  cell: (c) =>
                    c.tags.length === 0 ? (
                      <span className="text-fg-subtle">—</span>
                    ) : (
                      <div className="flex max-w-56 flex-wrap gap-1">
                        {c.tags.map((t) => (
                          <TagChip key={t.id} name={t.name} color={t.color} />
                        ))}
                      </div>
                    ),
                },
                {
                  key: "origem",
                  header: "Origem",
                  hideOnMobile: true,
                  className: "whitespace-nowrap text-fg-muted",
                  cell: (c) => CONTACT_SOURCES[c.source],
                },
                {
                  key: "responsavel",
                  header: "Responsável",
                  className: "whitespace-nowrap text-fg-muted",
                  cell: (c) => (c.owner_id ? (memberName.get(c.owner_id) ?? "—") : "—"),
                },
                {
                  key: "comunicacoes",
                  header: "Comunicações",
                  cell: (c) => (
                    <Badge tone={c.marketing_consent === "granted" ? "brand" : c.marketing_consent === "revoked" ? "danger" : "neutral"}>
                      {c.marketing_consent === "granted"
                        ? "Autorizou"
                        : c.marketing_consent === "revoked"
                          ? "Descadastrado"
                          : "Não informado"}
                    </Badge>
                  ),
                },
              ]}
            />
            <Pagination
              page={page}
              pageSize={CONTACTS_PAGE_SIZE}
              total={total}
              basePath="/contatos"
              params={{
                q: params.q,
                etiqueta: params.etiqueta,
                responsavel: params.responsavel,
                origem: params.origem,
                consentimento: params.consentimento,
              }}
            />
          </>
        )}
      </Card>
    </>
  );
}
