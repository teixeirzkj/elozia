import { Skeleton } from "@/components/ui/primitives";

/** Carregamento dentro do layout das configurações (o cabeçalho e o menu já estão na tela). */
export default function Loading() {
  return (
    <div role="status" aria-label="Carregando" className="max-w-3xl space-y-3 rounded-lg border border-line bg-surface p-5">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-2/3" />
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
