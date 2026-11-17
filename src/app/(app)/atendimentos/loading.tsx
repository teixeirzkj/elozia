import { Skeleton } from "@/components/ui/primitives";

/** Esqueleto da central: lista de conversas, conversa e painel do cliente (xl+). */
export default function AtendimentosLoading() {
  return (
    <div className="fixed inset-x-0 top-header bottom-0 flex bg-bg" role="status" aria-label="Carregando atendimentos">
      <span className="sr-only">Carregando…</span>

      {/* Lista de conversas */}
      <div className="flex min-h-0 w-full shrink-0 flex-col border-r border-line bg-surface md:w-72 lg:w-80 xl:w-inbox-list" aria-hidden="true">
        <div className="space-y-3 border-b border-line p-3 sm:px-4">
          <Skeleton className="h-5 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-8 flex-1" />
            <Skeleton className="h-8 flex-1" />
            <Skeleton className="h-8 flex-1" />
          </div>
        </div>
        <div className="space-y-2 border-b border-line p-3 sm:px-4">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="flex gap-3 border-b border-line py-3 pr-3 pl-3 sm:pr-4 sm:pl-4">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex justify-between gap-3">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-4 w-24 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Conversa */}
      <div className="hidden min-h-0 min-w-0 flex-1 flex-col md:flex" aria-hidden="true">
        <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="hidden h-8 w-24 lg:block" />
          <Skeleton className="hidden h-8 w-24 lg:block" />
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-hidden px-6 py-4">
          <Skeleton className="h-14 w-64 max-w-full rounded-xl" />
          <Skeleton className="ml-auto h-10 w-56 max-w-full rounded-xl" />
          <Skeleton className="h-20 w-72 max-w-full rounded-xl" />
          <Skeleton className="ml-auto h-14 w-60 max-w-full rounded-xl" />
          <Skeleton className="h-10 w-48 max-w-full rounded-xl" />
        </div>
        <div className="space-y-2.5 border-t border-line bg-surface px-4 pt-2.5 pb-3">
          <Skeleton className="h-8 w-56 rounded-md" />
          <div className="flex items-end gap-2">
            <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
            <Skeleton className="h-14 flex-1 rounded-md" />
            <Skeleton className="h-10 w-24 shrink-0 rounded-md" />
          </div>
        </div>
      </div>

      {/* Painel do cliente */}
      <div className="hidden w-aside shrink-0 space-y-4 border-l border-line bg-surface p-5 xl:block" aria-hidden="true">
        <div className="flex flex-col items-center gap-2 pb-2">
          <Skeleton className="h-14 w-14 rounded-full" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-16 w-full rounded-md" />
        <Skeleton className="h-16 w-full rounded-md" />
      </div>
    </div>
  );
}
