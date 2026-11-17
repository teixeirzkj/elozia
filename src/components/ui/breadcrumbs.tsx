import { ChevronRight } from "lucide-react";
import Link from "next/link";

export type Crumb = { label: string; href?: string };

/** Trilha de navegação para páginas internas (ex.: Contatos › Nome do contato). */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Trilha de navegação" className="mb-3">
      <ol className="flex flex-wrap items-center gap-1 text-label text-fg-subtle">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {item.href && !last ? (
                <Link href={item.href} className="truncate rounded font-semibold text-fg-muted transition-colors hover:text-fg">
                  {item.label}
                </Link>
              ) : (
                <span className="truncate font-semibold text-fg" aria-current={last ? "page" : undefined}>
                  {item.label}
                </span>
              )}
              {last ? null : <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
