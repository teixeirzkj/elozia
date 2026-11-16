import { Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import { Card, CardHeader } from "@/components/ui/primitives";
import { CAPABILITIES, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type Role } from "@/lib/permissions";

export const metadata: Metadata = { title: "Permissões" };

export default function PermissoesPage() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ROLES.map((role) => (
          <Card key={role} className="p-4">
            <p className="text-sm font-bold">{ROLE_LABELS[role]}</p>
            <p className="mt-1 text-[13px] text-fg-muted">{ROLE_DESCRIPTIONS[role]}</p>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <CardHeader
          title="O que cada papel pode fazer"
          description="As permissões são fixas por papel e verificadas no servidor e no banco de dados."
        />
        <div className="overflow-x-auto">
          <table className="elz-table">
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
              {Object.entries(CAPABILITIES).map(([key, cap]) => (
                <tr key={key}>
                  <th scope="row" className="!bg-transparent !text-sm !font-medium !text-fg !whitespace-normal">
                    {cap.label}
                  </th>
                  {ROLES.map((role) => {
                    const allowed = (cap.roles as readonly Role[]).includes(role);
                    return (
                      <td key={role} className="text-center">
                        {allowed ? (
                          <Check className="mx-auto h-4 w-4 text-brand-strong" aria-label="Permitido" />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-fg-subtle" aria-label="Não permitido" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
