import { Skeleton } from "@/components/ui/primitives";

/** Carregamento das telas de autenticação, com a forma de um formulário curto. */
export default function AuthLoading() {
  return (
    <div role="status">
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="mt-3 h-4 w-3/4" />
      <div className="mt-8 space-y-5">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
