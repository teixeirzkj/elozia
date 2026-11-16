import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { requireCapabilityPage } from "@/lib/auth/session";
import { ImportForm } from "@/modules/contacts/components/import-form";

export const metadata: Metadata = { title: "Importar contatos" };

export default async function ImportarContatosPage() {
  await requireCapabilityPage("crm.import");
  return (
    <>
      <Link href="/contatos" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Contatos
      </Link>
      <PageHeader title="Importar contatos" description="Envie um arquivo CSV com os contatos da agência." />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="min-w-0">
          <CardHeader title="Arquivo" />
          <CardBody>
            <ImportForm />
          </CardBody>
        </Card>
        <Card className="h-fit min-w-0">
          <CardHeader title="Formato do arquivo" />
          <CardBody className="space-y-3 text-sm text-fg-muted">
            <p>
              A primeira linha é o cabeçalho. Colunas aceitas: <strong className="text-fg">nome</strong> (obrigatória),{" "}
              <strong className="text-fg">telefone</strong>, <strong className="text-fg">email</strong>,{" "}
              <strong className="text-fg">observacoes</strong> e <strong className="text-fg">consentimento</strong>.
            </p>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs text-fg">
              {"nome;telefone;email;consentimento\nContato Exemplo;(11) 90000-0000;contato@exemplo.test;sim"}
            </pre>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Separador vírgula ou ponto e vírgula; até 2.000 linhas e 1 MB por arquivo.</li>
              <li>Telefones são validados e gravados no padrão internacional (E.164).</li>
              <li>Telefones já cadastrados são ignorados, nunca sobrescritos.</li>
              <li>Linhas com erro são listadas ao final e não são importadas.</li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
