import type { Metadata } from "next";
import { ActionForm, PasswordField, SubmitButton, TextField } from "@/components/ui/form";
import { signUpAction } from "@/modules/auth/actions";
import { AuthFooter, AuthHeading, AuthLink } from "../_components/auth-ui";

export const metadata: Metadata = { title: "Cadastrar agência" };

export default function CadastroPage() {
  return (
    <>
      <AuthHeading title="Cadastrar minha agência">
        Crie a conta do responsável pela agência. Depois você convida a equipe.
      </AuthHeading>
      <ActionForm action={signUpAction}>
        <TextField name="agency_name" label="Nome da agência" autoComplete="organization" required maxLength={120} />
        <TextField name="full_name" label="Seu nome" autoComplete="name" required maxLength={120} />
        <TextField name="email" label="E-mail" type="email" autoComplete="email" inputMode="email" required />
        <PasswordField
          name="password"
          label="Senha"
          autoComplete="new-password"
          hint="Pelo menos 8 caracteres, com letras e números."
          required
        />
        <SubmitButton className="min-h-touch w-full">Criar conta</SubmitButton>
      </ActionForm>
      <AuthFooter>
        <p className="flex flex-wrap items-center gap-x-1.5">
          Já tem conta?
          <AuthLink href="/entrar">Entrar</AuthLink>
        </p>
      </AuthFooter>
    </>
  );
}
