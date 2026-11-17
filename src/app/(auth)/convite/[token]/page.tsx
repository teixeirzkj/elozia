import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { ActionForm, PasswordField, SubmitButton, TextField } from "@/components/ui/form";
import { getSession } from "@/lib/auth/session";
import { isRole, ROLE_LABELS } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { invitedSignUpAction, signOutAction } from "@/modules/auth/actions";
import { AcceptInvitationButton } from "@/modules/auth/components/accept-invitation-button";
import { AuthFooter, AuthHeading, AuthLink } from "../../_components/auth-ui";

export const metadata: Metadata = { title: "Convite" };

export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_invitation", { p_token: token });
  const invitation = (data as Array<{ organization_name: string; email: string; role: string }> | null)?.[0];

  if (!invitation) {
    return (
      <>
        <AuthHeading title="Convite indisponível">
          Este convite é inválido, já foi usado, foi cancelado ou expirou. Peça um novo convite ao responsável pela sua
          agência.
        </AuthHeading>
        <LinkButton href="/entrar" variant="secondary" className="min-h-touch w-full">
          Ir para o login
        </LinkButton>
      </>
    );
  }

  const session = await getSession();
  const roleLabel = isRole(invitation.role) ? ROLE_LABELS[invitation.role] : invitation.role;
  const intro = (
    <AuthHeading title={`Convite para ${invitation.organization_name}`}>
      Você foi convidado como <strong className="font-semibold text-fg">{roleLabel}</strong> usando o e-mail{" "}
      <strong className="font-semibold break-all text-fg">{invitation.email}</strong>.
    </AuthHeading>
  );

  if (session) {
    const sameEmail = session.user.email.toLowerCase() === invitation.email;
    return (
      <>
        {intro}
        {session.membership ? (
          <Alert tone="warning">
            Sua conta já pertence à agência {session.membership.organization.name}. Cada conta participa de uma única
            agência.
          </Alert>
        ) : sameEmail ? (
          <AcceptInvitationButton token={token} />
        ) : (
          <Alert tone="warning">
            Você está conectado como {session.user.email}. Saia e entre com {invitation.email} para aceitar.
          </Alert>
        )}
        <form action={signOutAction} className="mt-3">
          <Button type="submit" variant="ghost" className="min-h-touch w-full">
            Sair desta conta
          </Button>
        </form>
      </>
    );
  }

  return (
    <>
      {intro}
      <ActionForm action={invitedSignUpAction}>
        <input type="hidden" name="token" value={token} />
        <TextField name="full_name" label="Seu nome" autoComplete="name" required maxLength={120} />
        <PasswordField
          name="password"
          label="Crie uma senha"
          autoComplete="new-password"
          hint="Pelo menos 8 caracteres, com letras e números."
          required
        />
        <SubmitButton className="min-h-touch w-full">Criar conta e aceitar</SubmitButton>
      </ActionForm>
      <AuthFooter>
        <p className="flex flex-wrap items-center gap-x-1.5">
          Já tem conta com este e-mail?
          <AuthLink href={`/entrar?proximo=${encodeURIComponent(`/convite/${token}`)}`}>Entrar para aceitar</AuthLink>
        </p>
      </AuthFooter>
    </>
  );
}
