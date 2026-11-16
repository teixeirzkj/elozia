import type { ReactNode } from "react";
import { Logo } from "@/components/layout/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-10">
      <main className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo className="w-44" />
        </div>
        <div className="rounded-lg border border-line bg-surface p-6 shadow-card sm:p-8">{children}</div>
        <p className="mt-6 text-center text-xs text-fg-subtle">Elozia · CRM inteligente para agências de viagens.</p>
      </main>
    </div>
  );
}
