import { Tags, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { ConfirmButton } from "@/components/ui/dialog";
import { Card, CardHeader, EmptyState, TagChip } from "@/components/ui/primitives";
import { requireCapabilityPage } from "@/lib/auth/session";
import { deleteTagAction } from "@/modules/contacts/actions";
import { TagDialog } from "@/modules/contacts/components/tag-dialog";
import { listTags } from "@/modules/contacts/queries";

export const metadata: Metadata = { title: "Etiquetas" };

export default async function EtiquetasPage() {
  const { supabase, membership } = await requireCapabilityPage("settings.crm");
  const tags = await listTags(supabase, membership.organization.id);

  return (
    <Card className="max-w-3xl overflow-hidden">
      <CardHeader
        title="Etiquetas"
        description="Usadas para classificar contatos, filtrar listas e segmentar campanhas."
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
        <ul className="divide-y divide-line">
          {tags.map((tag) => (
            <li key={tag.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <TagChip name={tag.name} color={tag.color} />
              <div className="flex gap-0.5">
                <TagDialog tag={tag} />
                <ConfirmButton
                  icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                  ariaLabel={`Excluir etiqueta ${tag.name}`}
                  buttonSize="icon"
                  variant="ghost"
                  title="Excluir etiqueta"
                  description={`A etiqueta ${tag.name} será removida de todos os contatos.`}
                  confirmLabel="Excluir"
                  action={deleteTagAction.bind(null, tag.id)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
