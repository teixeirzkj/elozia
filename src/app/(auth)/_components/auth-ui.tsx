import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Título e subtítulo padrão das telas de autenticação. */
export function AuthHeading({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-heading font-bold tracking-tight text-fg sm:text-display">{title}</h1>
      {children ? <p className="mt-1.5 text-body text-fg-muted">{children}</p> : null}
    </header>
  );
}

/** Link de texto das telas de autenticação, com alvo de toque de 44px. */
export function AuthLink({ className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      className={cn(
        "inline-flex min-h-touch items-center rounded-sm font-semibold text-green-800 underline-offset-4 hover:text-green-900 hover:underline",
        className,
      )}
    />
  );
}

/** Rodapé do cartão, separado do formulário por uma linha. */
export function AuthFooter({ children }: { children: ReactNode }) {
  return <div className="mt-6 border-t border-line pt-4 text-body text-fg-muted">{children}</div>;
}
