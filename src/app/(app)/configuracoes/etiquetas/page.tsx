import { Tags, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { DataList, type DataColumn } from "@/components/ui/data-list";
import { ConfirmButton } from "@/components/ui/dialog";
import { Card, CardHeader, EmptyState, TagChip } from "@/components/ui/primitives";
import { requireCapabilityPage } from "@/lib/auth/session";
import { deleteTagAction } from "@/modules/contacts/actions";
import { TagDialog } from "@/modules/contacts/components/tag-dialog";
import { listTags } from "@/modules/contacts/queries";

export const metadata: Metadata = { title: "Etiquetas" };

type TagRow = Awaited<ReturnType<typeof listTags>>[number];

export default async function EtiquetasPage() {
  const { supabase, membership } = await requireCapabilityPage("settings.crm");
  const tags = await listTags(supabase, membership.organization.id);

  const columns: DataColumn<TagRow>[] = [
    { key: "name", header: "Etiqueta", primary: true, cell: (tag) => <TagChip name={tag.name} color={tag.color} /> },
    {
      key: "actions",
      header: "Ações",
      actions: true,
      align: "end",
      cell: (tag) => (
        <div className="flex justify-end gap-1">
          <TagDialog tag={tag} />
          <ConfirmButton
            icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
            ariaLabel={`Excluir etiqueta ${tag.name}`}
            buttonSize="icon"
            variant="ghost"
            className="max-md:h-touch max-md:w-touch"
            title="Excluir etiqueta"
            description={`A etiqueta ${tag.name} será removida de todos os contatos.`}
            confirmLabel="Excluir"
            action={deleteTagAction.bind(null, tag.id)}
          />
        </div>
      ),
    },
  ];

  return (
    <Card className="max-w-3xl overflow-hidden">
      <CardHeader
        title="Etiquetas"
        description={
          tags.length === 0
            ? "Usadas para classificar contatos, filtrar listas e segmentar campanhas."
            : `${tags.length} ${tags.length === 1 ? "etiqueta" : "etiquetas"} para classificar contatos, filtrar listas e segmentar campanhas.`
        }
        action={<TagDialog />}
      />
      {tags.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="Nenhuma etiqueta criada"
          description="Crie etiquetas como Família, Lua de mel ou Corporativo para organizar os contatos."
          className="py-10"
        />
      ) : (
        <DataList columns={columns} rows={tags} getKey={(tag) => tag.id} caption="Etiquetas da agência" />
      )}
    </Card>
  );
}
