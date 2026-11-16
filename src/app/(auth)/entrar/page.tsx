import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { signInAction } from "@/modules/auth/actions";
import { safeNextPath } from "@/modules/auth/schemas";

export const metadata: Metadata = { title: "Entrar" };

export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ proximo?: string; erro?: string }> }) {
  const { proximo, erro } = await searchParams;
  return (
    <>
      <h1 className="text-xl font-bold tracking-tight">Entrar</h1>
      <p className="mt-1 mb-5 text-sm text-fg-muted">Acesse o painel da sua agência.</p>
      {erro === "link-invalido" ? (
        <Alert tone="warning" className="mb-4">
          O link usado é inválido ou expirou. Entre com sua senha ou solicite um novo link.
        </Alert>
      ) : null}
      <ActionForm action={signInAction}>
        <input type="hidden" name="proximo" value={safeNextPath(proximo)} />
        <TextField name="email" label="E-mail" type="email" autoComplete="email" inputMode="email" required />
        <TextField name="password" label="Senha" type="password" autoComplete="current-password" required />
        <SubmitButton className="w-full">Entrar</SubmitButton>
      </ActionForm>
      <div className="mt-5 flex flex-wrap justify-between gap-2 text-sm">
        <Link href="/recuperar-senha" className="font-semibold text-brand-strong hover:underline">
          Esqueci minha senha
        </Link>
        <Link href="/cadastro" className="font-semibold text-brand-strong hover:underline">
          Cadastrar minha agência
        </Link>
      </div>
    </>
  );
}
