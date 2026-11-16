import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { requestPasswordResetAction } from "@/modules/auth/actions";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function RecuperarSenhaPage() {
  return (
    <>
      <h1 className="text-xl font-bold tracking-tight">Recuperar senha</h1>
      <p className="mt-1 mb-5 text-sm text-fg-muted">Informe seu e-mail para receber um link de redefinição.</p>
      <ActionForm action={requestPasswordResetAction} resetOnSuccess>
        <TextField name="email" label="E-mail" type="email" autoComplete="email" inputMode="email" required />
        <SubmitButton className="w-full">Enviar link</SubmitButton>
      </ActionForm>
      <p className="mt-5 text-sm">
        <Link href="/entrar" className="font-semibold text-brand-strong hover:underline">
          Voltar para o login
        </Link>
      </p>
    </>
  );
}
