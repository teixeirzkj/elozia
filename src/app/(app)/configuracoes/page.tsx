import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { TIMEZONES } from "@/lib/timezones";
import { updateOrganizationAction } from "@/modules/settings/actions";
import { getOrganization } from "@/modules/settings/queries";

export const metadata: Metadata = { title: "Configurações da agência" };

export default async function AgenciaPage() {
  const { supabase, membership } = await requireMembership();
  const org = await getOrganization(supabase, membership.organization.id);
  const editable = can(membership.role, "organization.manage");
  const timezones = TIMEZONES.some((t) => t.value === org.timezone)
    ? TIMEZONES
    : [{ value: org.timezone, label: org.timezone }, ...TIMEZONES];

  return (
    <Card className="max-w-2xl">
      <CardHeader title="Dados da agência" description="Informações usadas no sistema e nos relatórios." />
      <CardBody>
        {!editable ? (
          <Alert tone="info" className="mb-4">
            Somente o proprietário e os administradores podem alterar estes dados.
          </Alert>
        ) : null}
        <ActionForm action={updateOrganizationAction}>
          <fieldset disabled={!editable} className="space-y-4">
            <TextField name="name" label="Nome da agência" defaultValue={org.name} required maxLength={120} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="phone" label="Telefone" defaultValue={org.phone ?? ""} inputMode="tel" maxLength={30} />
              <TextField name="email" label="E-mail de contato" type="email" defaultValue={org.email ?? ""} />
            </div>
            <TextField name="document" label="CNPJ" defaultValue={org.document ?? ""} maxLength={30} />
            <SelectField
              name="timezone"
              label="Fuso horário"
              defaultValue={org.timezone}
              hint="Define os horários de agendamentos, automações e relatórios."
              required
            >
              {timezones.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </SelectField>
          </fieldset>
          {editable ? <SubmitButton>Salvar alterações</SubmitButton> : null}
        </ActionForm>
      </CardBody>
    </Card>
  );
}
