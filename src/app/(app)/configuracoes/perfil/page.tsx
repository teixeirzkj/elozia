import type { Metadata } from "next";
import { LinkButton } from "@/components/ui/button";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/permissions";
import { updateProfileAction } from "@/modules/settings/actions";

export const metadata: Metadata = { title: "Meu perfil" };

export default async function PerfilPage() {
  const { user, membership } = await requireMembership();
  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader title="Meus dados" action={<Badge tone="brand">{ROLE_LABELS[membership.role]}</Badge>} />
        <CardBody>
          <ActionForm action={updateProfileAction}>
            <TextField name="full_name" label="Nome" defaultValue={user.fullName} required maxLength={120} />
            <TextField
              name="email_display"
              label="E-mail"
              defaultValue={user.email}
              disabled
              hint="O e-mail identifica a sua conta e não pode ser alterado aqui."
            />
            <TextField name="phone" label="Telefone" defaultValue={user.phone ?? ""} inputMode="tel" maxLength={30} />
            <SubmitButton>Salvar perfil</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Senha" description="Troque a senha de acesso à sua conta." />
        <CardBody>
          <LinkButton href="/redefinir-senha" variant="secondary">
            Alterar senha
          </LinkButton>
        </CardBody>
      </Card>
    </div>
  );
}
