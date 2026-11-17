import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Lista de registros que vira TABELA a partir de `md` e CARTÕES no celular,
 * a partir das mesmas colunas. Server Component (sem JavaScript no cliente).
 *
 * - `primary`: coluna que vira o título do cartão (uma por lista).
 * - `hideOnMobile`: coluna omitida no cartão.
 * - `align: "end"`: alinhada à direita (valores e ações).
 * - `actions`: coluna de ações; no cartão aparece no rodapé.
 */
export type DataColumn<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  primary?: boolean;
  hideOnMobile?: boolean;
  align?: "start" | "end" | "center";
  actions?: boolean;
  className?: string;
};

export function DataList<T>({
  columns,
  rows,
  getKey,
  rowHref,
  caption,
}: {
  columns: DataColumn<T>[];
  rows: T[];
  getKey: (row: T) => string;
  /**
   * Torna o cartão inteiro clicável no celular (só ponteiro). A coluna primary
   * precisa conter um link para o mesmo destino, que é o acesso por teclado.
   */
  rowHref?: (row: T) => string;
  /** Descrição da tabela para leitores de tela. */
  caption?: string;
}) {
  const primary = columns.find((column) => column.primary) ?? columns[0]!;
  const details = columns.filter((column) => column !== primary && !column.hideOnMobile && !column.actions);
  const actions = columns.filter((column) => column.actions);

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="elz-table">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(column.align === "end" && "text-right", column.align === "center" && "text-center", column.className)}
                >
                  {column.actions ? <span className="sr-only">{column.header}</span> : column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getKey(row)}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(column.align === "end" && "text-right", column.align === "center" && "text-center", column.className)}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line md:hidden" aria-label={caption}>
        {rows.map((row) => {
          const body = (
            <>
              <div className="font-semibold text-fg">{primary.cell(row)}</div>
              {details.length > 0 ? (
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                  {details.map((column) => (
                    <div key={column.key} className="min-w-0">
                      <dt className="text-caption font-semibold tracking-wide text-fg-subtle uppercase">{column.header}</dt>
                      <dd className="mt-0.5 min-w-0 text-label break-words text-fg">{column.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </>
          );
          const footer =
            actions.length > 0 ? (
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {actions.map((column) => (
                  <div key={column.key}>{column.cell(row)}</div>
                ))}
              </div>
            ) : null;
          if (!rowHref) {
            return (
              <li key={getKey(row)} className="px-4 py-3.5">
                {body}
                {footer}
              </li>
            );
          }
          // O link do cartão fica ATRÁS do conteúdo, como irmão (nunca envolvendo
          // as células, que costumam ter seus próprios links: <a> dentro de <a>
          // é HTML inválido). Ele só atende o ponteiro; teclado e leitor de tela
          // usam o link da coluna primary, que deve levar ao mesmo destino.
          return (
            <li key={getKey(row)} className="relative px-4 py-3.5 transition-colors hover:bg-hover">
              <Link href={rowHref(row)} tabIndex={-1} aria-hidden="true" className="absolute inset-0" />
              <div className="elz-card-content relative">
                {body}
                {footer}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
