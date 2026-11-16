import type { Metadata } from "next";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { requireUser } from "@/lib/auth/session";
import { updatePasswordAction } from "@/modules/auth/actions";

export const metadata: Metadata = { title: "Nova senha" };

export default async function RedefinirSenhaPage() {
  await requireUser();
  return (
    <>
      <h1 className="text-xl font-bold tracking-tight">Criar nova senha</h1>
      <p className="mt-1 mb-5 text-sm text-fg-muted">Escolha uma nova senha para a sua conta.</p>
      <ActionForm action={updatePasswordAction}>
        <TextField
          name="password"
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          hint="Pelo menos 8 caracteres, com letras e números."
          required
        />
        <TextField name="confirm" label="Confirmar nova senha" type="password" autoComplete="new-password" required />
        <SubmitButton className="w-full">Salvar nova senha</SubmitButton>
      </ActionForm>
    </>
  );
}
