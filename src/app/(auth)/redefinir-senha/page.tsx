import type { Metadata } from "next";
import { ActionForm, PasswordField, SubmitButton } from "@/components/ui/form";
import { requireUser } from "@/lib/auth/session";
import { updatePasswordAction } from "@/modules/auth/actions";
import { AuthHeading } from "../_components/auth-ui";

export const metadata: Metadata = { title: "Nova senha" };

export default async function RedefinirSenhaPage() {
  await requireUser();
  return (
    <>
      <AuthHeading title="Criar nova senha">Escolha uma nova senha para a sua conta.</AuthHeading>
      <ActionForm action={updatePasswordAction}>
        <PasswordField
          name="password"
          label="Nova senha"
          autoComplete="new-password"
          hint="Pelo menos 8 caracteres, com letras e números."
          required
        />
        <PasswordField name="confirm" label="Confirmar nova senha" autoComplete="new-password" required />
        <SubmitButton className="min-h-touch w-full">Salvar nova senha</SubmitButton>
      </ActionForm>
    </>
  );
}
