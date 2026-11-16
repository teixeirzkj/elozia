import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "danger";

const tones: Record<Tone, { box: string; Icon: typeof Info }> = {
  info: { box: "bg-info-soft text-info border-info/20", Icon: Info },
  success: { box: "bg-brand-soft text-brand-strong border-brand-strong/20", Icon: CheckCircle2 },
  warning: { box: "bg-warning-soft text-warning border-warning/20", Icon: AlertTriangle },
  danger: { box: "bg-danger-soft text-danger border-danger/20", Icon: XCircle },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { box, Icon } = tones[tone];
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cn("flex gap-2.5 rounded-md border px-3 py-2.5 text-[13px]", box, className)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-0.5">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-fg">{children}</div> : null}
      </div>
    </div>
  );
}
