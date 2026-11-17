import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { ActionForm, PasswordField, SubmitButton, TextField } from "@/components/ui/form";
import { signInAction } from "@/modules/auth/actions";
import { safeNextPath } from "@/modules/auth/schemas";
import { AuthFooter, AuthHeading, AuthLink } from "../_components/auth-ui";

export const metadata: Metadata = { title: "Entrar" };

export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ proximo?: string; erro?: string }> }) {
  const { proximo, erro } = await searchParams;
  return (
    <>
      <AuthHeading title="Entrar">Acesse o painel da sua agência.</AuthHeading>
      {erro === "link-invalido" ? (
        <Alert tone="warning" className="mb-4">
          O link usado é inválido ou expirou. Entre com sua senha ou solicite um novo link.
        </Alert>
      ) : null}
      <ActionForm action={signInAction}>
        <input type="hidden" name="proximo" value={safeNextPath(proximo)} />
        <TextField name="email" label="E-mail" type="email" autoComplete="email" inputMode="email" required />
        <div>
          <PasswordField name="password" label="Senha" autoComplete="current-password" required />
          <div className="flex justify-end">
            <AuthLink href="/recuperar-senha" className="text-label">
              Esqueci minha senha
            </AuthLink>
          </div>
        </div>
        <SubmitButton className="min-h-touch w-full">Entrar</SubmitButton>
      </ActionForm>
      <AuthFooter>
        <p className="flex flex-wrap items-center gap-x-1.5">
          Ainda não usa a Elozia?
          <AuthLink href="/cadastro">Cadastrar minha agência</AuthLink>
        </p>
      </AuthFooter>
    </>
  );
}
