import type { LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn, initials } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-line bg-surface shadow-card", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-title font-bold text-fg">{title}</h2>
        {description ? <p className="mt-0.5 text-label text-fg-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-heading font-bold tracking-tight text-fg sm:text-display">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-body text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export type BadgeTone = "neutral" | "brand" | "info" | "warning" | "danger" | "lead" | "progress" | "proposal" | "won" | "lost";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-muted text-fg-muted",
  brand: "bg-brand-soft text-brand-strong",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  lead: "bg-status-lead-soft text-status-lead",
  progress: "bg-status-progress-soft text-status-progress",
  proposal: "bg-status-proposal-soft text-status-proposal",
  won: "bg-status-won-soft text-status-won",
  lost: "bg-status-lost-soft text-status-lost",
};

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        badgeTones[tone],
        className,
      )}
      {...props}
    />
  );
}

/** Etiqueta colorida definida pela agência (cor validada no servidor). */
export function TagChip({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-medium text-fg">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      {name}
    </span>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-ink font-bold text-brand"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials(name)}
    </span>
  );
}

/** Estado vazio verdadeiro: diz o que falta e, quando existe, oferece a ação real. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex animate-rise-in flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-700 ring-8 ring-green-50/50">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="text-base font-bold text-fg">{title}</h2>
      {description ? <p className="mt-1 max-w-md text-body text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("elz-skeleton", className)} aria-hidden="true" />;
}

function SkeletonHeader() {
  return (
    <>
      <Skeleton className="mb-2 h-7 w-56" />
      <Skeleton className="mb-6 h-4 w-80 max-w-full" />
    </>
  );
}

function Loading({ children }: { children: ReactNode }) {
  return (
    <div role="status" aria-label="Carregando">
      {children}
      <span className="sr-only">Carregando…</span>
    </div>
  );
}

/** Carregamento padrão de página (formulários e conteúdo genérico). */
export function PageSkeleton() {
  return (
    <Loading>
      <SkeletonHeader />
      <div className="space-y-3 rounded-lg border border-line bg-surface p-5">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    </Loading>
  );
}

/** Carregamento de listas em tabela (contatos, reservas, oportunidades...). */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <Loading>
      <SkeletonHeader />
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="flex gap-3 border-b border-line p-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="hidden h-10 w-40 sm:block" />
          <Skeleton className="hidden h-10 w-40 md:block" />
        </div>
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-4 border-b border-line px-5 py-3.5 last:border-0">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden h-4 w-28 sm:block" />
            <Skeleton className="hidden h-4 w-20 md:block" />
          </div>
        ))}
      </div>
    </Loading>
  );
}

/** Carregamento de grade de cartões (pacotes) e de indicadores. */
export function CardGridSkeleton({ cards = 6, stats = 0 }: { cards?: number; stats?: number }) {
  return (
    <Loading>
      <SkeletonHeader />
      {stats > 0 ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: stats }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }, (_, index) => (
          <Skeleton key={index} className="h-56 rounded-lg" />
        ))}
      </div>
    </Loading>
  );
}

/** Carregamento de página de detalhe (coluna principal + lateral). */
export function DetailSkeleton() {
  return (
    <Loading>
      <Skeleton className="mb-3 h-4 w-40" />
      <SkeletonHeader />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-56 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
      </div>
    </Loading>
  );
}

/** Carregamento do quadro Kanban. */
export function BoardSkeleton() {
  return (
    <Loading>
      <SkeletonHeader />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="w-72 shrink-0 space-y-2 rounded-lg border border-line bg-muted p-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        ))}
      </div>
    </Loading>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: LucideIcon;
  tone?: "neutral" | "brand" | "info" | "warning" | "danger";
}) {
  const iconTone = {
    neutral: "bg-muted text-fg-muted",
    brand: "bg-green-50 text-green-700",
    info: "bg-info-soft text-info",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  }[tone];
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-label font-medium text-fg-muted">{label}</p>
        {Icon ? (
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", iconTone)}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-metric font-bold tracking-tight text-fg tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-fg-subtle">{hint}</p> : null}
    </Card>
  );
}
