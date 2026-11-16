import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { ConfirmButton } from "@/components/ui/dialog";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { TIMEZONES } from "@/lib/timezones";
import { updateOrganizationAction } from "@/modules/settings/actions";
import { clearDemoDataAction, loadDemoDataAction } from "@/modules/settings/demo";
import { getOrganization } from "@/modules/settings/queries";

export const metadata: Metadata = { title: "Configurações da agência" };

export default async function AgenciaPage() {
  const { supabase, membership } = await requireMembership();
  const org = await getOrganization(supabase, membership.organization.id);
  const editable = can(membership.role, "organization.manage");
  const { count: demoCount } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id)
    .eq("is_demo", true);
  const timezones = TIMEZONES.some((t) => t.value === org.timezone)
    ? TIMEZONES
    : [{ value: org.timezone, label: org.timezone }, ...TIMEZONES];

  return (
    <div className="max-w-2xl space-y-6">
    <Card>
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
    {editable ? (
      <Card>
        <CardHeader
          title="Dados de demonstração"
          description="Contatos, pacotes e oportunidades fictícios para conhecer o sistema. Ficam marcados com o selo “Demonstração” e nunca recebem mensagens."
        />
        <CardBody>
          {demoCount ? (
            <ConfirmButton
              label="Remover dados de demonstração"
              buttonSize="md"
              title="Remover dados de demonstração"
              description="Todos os contatos, pacotes e oportunidades de demonstração serão excluídos. Os dados reais da agência não são afetados."
              confirmLabel="Remover"
              action={clearDemoDataAction}
            />
          ) : (
            <ConfirmButton
              label="Carregar dados de demonstração"
              buttonSize="md"
              danger={false}
              title="Carregar dados de demonstração"
              description="Serão criados 5 contatos, 2 pacotes e 5 oportunidades fictícios, identificados como demonstração. Você pode removê-los a qualquer momento."
              confirmLabel="Carregar"
              action={loadDemoDataAction}
            />
          )}
        </CardBody>
      </Card>
    ) : null}
    </div>
  );
}
