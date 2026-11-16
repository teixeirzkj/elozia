import type { Metadata } from "next";
import { Button, LinkButton } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Card, PageHeader } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { listPackageOptions } from "@/modules/catalog/queries";
import { BOOKING_STATUS_LABELS } from "@/modules/crm/types";
import { BookingList } from "@/modules/pipeline/components/lists";
import { BookingDialog } from "@/modules/pipeline/components/pipeline-dialogs";
import { BOOKINGS_PAGE_SIZE, listBookings } from "@/modules/pipeline/queries";

export const metadata: Metadata = { title: "Reservas" };

export default async function ReservasPage({ searchParams }: { searchParams: Promise<{ situacao?: string; pagina?: string }> }) {
  const params = await searchParams;
  const { supabase, membership } = await requireMembership();
  const orgId = membership.organization.id;
  const [{ bookings, total, page }, packages] = await Promise.all([
    listBookings(supabase, orgId, { status: params.situacao, page: Number(params.pagina) || 1 }),
    listPackageOptions(supabase, orgId),
  ]);

  return (
    <>
      <PageHeader
        title="Reservas"
        description="Vendas confirmadas pela agência. O pagamento é apenas declarado pela equipe."
        actions={<BookingDialog packages={packages} />}
      />
      <Card className="overflow-hidden">
        <form method="get" className="flex flex-wrap gap-2 border-b border-line p-4">
          <select name="situacao" defaultValue={params.situacao ?? ""} aria-label="Filtrar por situação" className="elz-field w-auto min-w-52">
            <option value="">Todas as situações</option>
            {Object.entries(BOOKING_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
          {params.situacao ? (
            <LinkButton href="/viagens/reservas" variant="ghost">
              Limpar
            </LinkButton>
          ) : null}
        </form>
        <BookingList bookings={bookings} packages={packages} showContact />
        <Pagination page={page} pageSize={BOOKINGS_PAGE_SIZE} total={total} basePath="/viagens/reservas" params={{ situacao: params.situacao }} />
      </Card>
    </>
  );
}
