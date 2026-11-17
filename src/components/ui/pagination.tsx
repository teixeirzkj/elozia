import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "./button";

/** Paginação por link, preservando os filtros atuais da URL. */
export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  params,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
    if (target > 1) search.set("pagina", String(target));
    const qs = search.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-label">
      <p className="text-fg-muted">
        Página {page} de {pages} · {total} {total === 1 ? "registro" : "registros"}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={buttonClass("secondary", "sm")}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Anterior
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={href(page + 1)} className={buttonClass("secondary", "sm")}>
            Próxima
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
