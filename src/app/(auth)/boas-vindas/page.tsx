import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import { requireUser } from "@/lib/auth/session";
import { TIMEZONES } from "@/lib/timezones";
import { createOrganizationAction, signOutAction } from "@/modules/auth/actions";

export const metadata: Metadata = { title: "Configurar agência" };

export default async function BoasVindasPage() {
  const session = await requireUser();
  if (session.membership) redirect("/dashboard");

  const { data: auth } = await session.supabase.auth.getUser();
  const suggested = typeof auth.user?.user_metadata?.agency_name === "string" ? auth.user.user_metadata.agency_name : "";

  return (
    <>
      <h1 className="text-xl font-bold tracking-tight">Configure sua agência</h1>
      <p className="mt-1 mb-5 text-sm text-fg-muted">
        Olá, {session.user.fullName}. Confirme os dados para criar o ambiente da sua agência. Se você foi convidado por
        uma agência, use o link do convite em vez deste formulário.
      </p>
      <ActionForm action={createOrganizationAction}>
        <TextField name="name" label="Nome da agência" defaultValue={suggested} required maxLength={120} />
        <SelectField
          name="timezone"
          label="Fuso horário"
          defaultValue="America/Sao_Paulo"
          hint="Usado em agendamentos, automações e relatórios."
          required
        >
          {TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </SelectField>
        <SubmitButton className="w-full">Criar agência</SubmitButton>
      </ActionForm>
      <form action={signOutAction} className="mt-4">
        <Button type="submit" variant="ghost" className="w-full">
          Sair
        </Button>
      </form>
    </>
  );
}
