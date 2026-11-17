import { Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { CAPABILITIES, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type Role } from "@/lib/permissions";

export const metadata: Metadata = { title: "Permissões" };

const capabilities = Object.entries(CAPABILITIES).map(([key, cap]) => ({
  key,
  label: cap.label,
  roles: cap.roles as readonly Role[],
}));

export default function PermissoesPage() {
  return (
    <div className="max-w-5xl space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {ROLES.map((role) => (
          <Card key={role} className="p-4">
            <p className="text-body font-bold text-fg">{ROLE_LABELS[role]}</p>
            <p className="mt-1 text-label text-fg-muted">{ROLE_DESCRIPTIONS[role]}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="O que cada papel pode fazer"
          description="As permissões são fixas por papel e verificadas no servidor e no banco de dados."
        />

        {/* Tablet e desktop: matriz capacidade × papel. */}
        <div className="hidden overflow-x-auto md:block">
          <table className="elz-table">
            <caption className="sr-only">Capacidades permitidas para cada papel</caption>
            <thead>
              <tr>
                <th scope="col">Capacidade</th>
                {ROLES.map((role) => (
                  <th key={role} scope="col" className="text-center">
                    {ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {capabilities.map((cap) => (
                <tr key={cap.key}>
                  <th scope="row" className="!bg-transparent !text-body !font-medium !text-fg !whitespace-normal">
                    {cap.label}
                  </th>
                  {ROLES.map((role) => (
                    <td key={role} className="text-center">
                      {cap.roles.includes(role) ? (
                        <Check className="mx-auto h-4 w-4 text-brand-strong" role="img" aria-label="Permitido" />
                      ) : (
                        <Minus className="mx-auto h-4 w-4 text-fg-subtle" role="img" aria-label="Não permitido" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Celular: cada capacidade com os papéis que a têm. */}
        <ul className="divide-y divide-line md:hidden" aria-label="Capacidades permitidas para cada papel">
          {capabilities.map((cap) => (
            <li key={cap.key} className="px-4 py-3.5">
              <p className="text-body font-medium text-fg">{cap.label}</p>
              <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Papéis com esta permissão">
                {ROLES.filter((role) => cap.roles.includes(role)).map((role) => (
                  <li key={role}>
                    <Badge tone="brand">{ROLE_LABELS[role]}</Badge>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
