"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";

/**
 * Provedores globais do cliente.
 * MotionConfig reducedMotion="user": quem pediu menos movimento no sistema
 * operacional recebe as animações do Motion sem deslocamento (só opacidade).
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
      <ToastProvider>{children}</ToastProvider>
    </MotionConfig>
  );
}
