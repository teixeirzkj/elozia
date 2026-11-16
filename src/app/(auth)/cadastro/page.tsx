import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { signUpAction } from "@/modules/auth/actions";

export const metadata: Metadata = { title: "Cadastrar agência" };

export default function CadastroPage() {
  return (
    <>
      <h1 className="text-xl font-bold tracking-tight">Cadastrar minha agência</h1>
      <p className="mt-1 mb-5 text-sm text-fg-muted">
        Crie a conta do responsável pela agência. Depois você convida a equipe.
      </p>
      <ActionForm action={signUpAction}>
        <TextField name="agency_name" label="Nome da agência" autoComplete="organization" required maxLength={120} />
        <TextField name="full_name" label="Seu nome" autoComplete="name" required maxLength={120} />
        <TextField name="email" label="E-mail" type="email" autoComplete="email" inputMode="email" required />
        <TextField
          name="password"
          label="Senha"
          type="password"
          autoComplete="new-password"
          hint="Pelo menos 8 caracteres, com letras e números."
          required
        />
        <SubmitButton className="w-full">Criar conta</SubmitButton>
      </ActionForm>
      <p className="mt-5 text-sm text-fg-muted">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-semibold text-brand-strong hover:underline">
          Entrar
        </Link>
      </p>
    </>
  );
}
