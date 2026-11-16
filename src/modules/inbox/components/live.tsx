"use client";

import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition, type ReactNode } from "react";
import { useToast } from "@/components/ui/toast";
import type { ActionState } from "@/lib/action";
import { createClient } from "@/lib/supabase/client";
import { markReadAction } from "../actions";

/**
 * Atualiza a central quando chegam mensagens ou mudam conversas da agência.
 * As mudanças vêm pelo Supabase Realtime, já filtradas pela RLS do usuário.
 */
export function RealtimeRefresher({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };
    const filter = `organization_id=eq.${organizationId}`;
    const channel = supabase
      .channel(`inbox:${organizationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter }, refresh)
      .subscribe();
    // Rede de segurança caso a conexão em tempo real caia.
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60_000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [organizationId, router]);
  return null;
}

/** Área rolável do histórico: desce até a última mensagem e marca a conversa como lida. */
export function Thread({ conversationId, lastMessageId, unread, children }: { conversationId: string; lastMessageId: string | null; unread: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversationId, lastMessageId]);
  useEffect(() => {
    if (unread > 0) void markReadAction(conversationId);
  }, [conversationId, unread, lastMessageId]);
  return (
    <div ref={ref} className="flex-1 overflow-y-auto bg-bg px-3 py-4 sm:px-5" role="log" aria-label="Histórico da conversa" tabIndex={0}>
      {children}
    </div>
  );
}

/** Botão pequeno para reprocessar um envio ou um download de mídia. */
export function RetryButton({ action, label }: { action: () => Promise<ActionState>; label: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await action();
          if (result.ok) {
            if (result.message) toast.success(result.message);
          } else {
            toast.error(result.error ?? "Não foi possível concluir.");
          }
        })
      }
      className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold underline underline-offset-2 disabled:opacity-50"
    >
      <RotateCw className={pending ? "h-3 w-3 animate-spin" : "h-3 w-3"} aria-hidden="true" />
      {label}
    </button>
  );
}
