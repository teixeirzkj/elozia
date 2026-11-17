import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { requestPasswordResetAction } from "@/modules/auth/actions";
import { AuthFooter, AuthHeading, AuthLink } from "../_components/auth-ui";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function RecuperarSenhaPage() {
  return (
    <>
      <AuthHeading title="Recuperar senha">Informe seu e-mail para receber um link de redefinição.</AuthHeading>
      <ActionForm action={requestPasswordResetAction} resetOnSuccess>
        <TextField name="email" label="E-mail" type="email" autoComplete="email" inputMode="email" required />
        <SubmitButton className="min-h-touch w-full">Enviar link</SubmitButton>
      </ActionForm>
      <AuthFooter>
        <AuthLink href="/entrar" className="gap-1.5">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar para o login
        </AuthLink>
      </AuthFooter>
    </>
  );
}
