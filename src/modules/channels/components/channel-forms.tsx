"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { connectChannelAction, syncTemplatesAction } from "../actions";

export function ConnectForm({ requireAppSecret, reconnect }: { requireAppSecret: boolean; reconnect?: { wabaId: string; phoneNumberId: string } }) {
  return (
    <ActionForm action={connectChannelAction}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="waba_id"
          label="WABA ID"
          defaultValue={reconnect?.wabaId ?? ""}
          inputMode="numeric"
          required
          hint="Identificador da conta do WhatsApp Business."
        />
        <TextField
          name="phone_number_id"
          label="Phone Number ID"
          defaultValue={reconnect?.phoneNumberId ?? ""}
          inputMode="numeric"
          required
          hint="Identificador do número, não o telefone em si."
        />
      </div>
      <TextField
        name="token"
        label="Token permanente"
        type="password"
        autoComplete="off"
        required
        hint="Token de usuário do sistema com as permissões whatsapp_business_messaging e whatsapp_business_management. É guardado criptografado e nunca é exibido novamente."
      />
      <TextField
        name="app_secret"
        label={requireAppSecret ? "App Secret do aplicativo da Meta" : "App Secret do aplicativo da Meta (opcional)"}
        type="password"
        autoComplete="off"
        required={requireAppSecret}
        hint={
          requireAppSecret
            ? "Chave secreta do aplicativo que emitiu o token. É usada para conferir a assinatura dos webhooks."
            : "Preencha somente se o token foi emitido por um aplicativo da Meta da própria agência."
        }
      />
      <SubmitButton>{reconnect ? "Validar e reconectar" : "Validar e conectar"}</SubmitButton>
    </ActionForm>
  );
}

/**
 * Sincroniza os templates de um canal com a Meta. `channelLabel` identifica o
 * número quando há mais de um canal na mesma tela.
 */
export function SyncTemplatesButton({ channelId, channelLabel }: { channelId: string; channelLabel?: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      size="sm"
      className="max-md:min-h-touch"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await syncTemplatesAction(channelId);
          if (result.ok) {
            toast.success(result.message ?? "Templates sincronizados.");
            // A ação revalida só a página de canais; atualiza também a tela atual (ex.: Modelos).
            router.refresh();
          } else {
            toast.error(result.error ?? "Não foi possível sincronizar.");
          }
        })
      }
    >
      <RefreshCw className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
      {channelLabel ? `Sincronizar ${channelLabel}` : "Sincronizar templates"}
    </Button>
  );
}
