"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { LinkButton } from "@/components/ui/button";
import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { importContactsAction, type ImportSummary } from "../actions";

export function ImportForm() {
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  return (
    <div className="space-y-5">
      <ActionForm action={importContactsAction} resetOnSuccess hideSuccess onSuccess={(state) => setSummary(state.data as ImportSummary)}>
        <Field name="file" label="Arquivo CSV" required>
          {(field) => <input {...field} type="file" accept=".csv,text/csv" required className="elz-field file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-label file:font-semibold" />}
        </Field>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line p-3 text-label">
          <input type="checkbox" name="consent_confirmed" className="mt-0.5 h-4 w-4" />
          <span>
            <strong>Declaro que a agência tem autorização</strong> dos contatos marcados com “sim” na coluna consentimento
            para receber comunicações comerciais. Sem esta declaração, todos entram como “não informado” e não recebem
            campanhas.
          </span>
        </label>
        <SubmitButton>Importar contatos</SubmitButton>
      </ActionForm>

      {summary ? (
        <div className="space-y-3" aria-live="polite">
          <Alert tone={summary.imported > 0 ? "success" : "warning"} title="Resultado da importação">
            <ul className="mt-1 space-y-0.5">
              <li>Linhas no arquivo: {summary.totalLines}</li>
              <li>Contatos importados: {summary.imported}</li>
              <li>Ignorados por telefone já cadastrado: {summary.duplicates}</li>
              <li>Linhas com erro: {summary.issues.length}</li>
            </ul>
          </Alert>
          {summary.issues.length > 0 ? (
            <div className="max-h-64 overflow-y-auto rounded-md border border-line">
              <table className="elz-table">
                <thead>
                  <tr>
                    <th scope="col">Linha</th>
                    <th scope="col">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.issues.map((issue) => (
                    <tr key={`${issue.line}-${issue.reason}`}>
                      <td className="w-20">{issue.line}</td>
                      <td>{issue.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <LinkButton href="/contatos" variant="secondary">
            Ver contatos
          </LinkButton>
        </div>
      ) : null}
    </div>
  );
}
