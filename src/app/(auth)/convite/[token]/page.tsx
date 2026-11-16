import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { getSession } from "@/lib/auth/session";
import { isRole, ROLE_LABELS } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { invitedSignUpAction, signOutAction } from "@/modules/auth/actions";
import { AcceptInvitationButton } from "@/modules/auth/components/accept-invitation-button";

export const metadata: Metadata = { title: "Convite" };

export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_invitation", { p_token: token });
  const invitation = (data as Array<{ organization_name: string; email: string; role: string }> | null)?.[0];

  if (!invitation) {
    return (
      <>
        <h1 className="text-xl font-bold tracking-tight">Convite indisponível</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Este convite é inválido, já foi usado, foi cancelado ou expirou. Peça um novo convite ao responsável pela sua
          agência.
        </p>
        <LinkButton href="/entrar" variant="secondary" className="mt-5 w-full">
          Ir para o login
        </LinkButton>
      </>
    );
  }

  const session = await getSession();
  const roleLabel = isRole(invitation.role) ? ROLE_LABELS[invitation.role] : invitation.role;
  const intro = (
    <>
      <h1 className="text-xl font-bold tracking-tight">Convite para {invitation.organization_name}</h1>
      <p className="mt-1 mb-5 text-sm text-fg-muted">
        Você foi convidado como <strong className="text-fg">{roleLabel}</strong> usando o e-mail{" "}
        <strong className="text-fg">{invitation.email}</strong>.
      </p>
    </>
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
          <Button type="submit" variant="ghost" className="w-full">
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
        <TextField
          name="password"
          label="Crie uma senha"
          type="password"
          autoComplete="new-password"
          hint="Pelo menos 8 caracteres, com letras e números."
          required
        />
        <SubmitButton className="w-full">Criar conta e aceitar</SubmitButton>
      </ActionForm>
      <p className="mt-5 text-sm text-fg-muted">
        Já tem conta com este e-mail?{" "}
        <Link
          href={`/entrar?proximo=${encodeURIComponent(`/convite/${token}`)}`}
          className="font-semibold text-brand-strong hover:underline"
        >
          Entrar para aceitar
        </Link>
      </p>
    </>
  );
}
