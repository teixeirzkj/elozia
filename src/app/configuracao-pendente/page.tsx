import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Configuração pendente" };
export const dynamic = "force-dynamic";

/** Exibida quando o ambiente ainda não tem as variáveis do Supabase. */
export default function ConfiguracaoPendentePage() {
  if (isSupabaseConfigured()) redirect("/entrar");
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <main className="w-full max-w-lg rounded-lg border border-line bg-surface p-6 shadow-card sm:p-8">
        <Logo className="mb-5 w-40" />
        <h1 className="text-xl font-bold tracking-tight">Configuração pendente</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Este ambiente ainda não está ligado a um projeto Supabase. Defina as variáveis{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[13px]">NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[13px]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> conforme o
          arquivo <code className="rounded bg-muted px-1 py-0.5 text-[13px]">.env.example</code> e a documentação de
          deploy, e reinicie a aplicação.
        </p>
      </main>
    </div>
  );
}
