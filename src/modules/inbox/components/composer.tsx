"use client";

import { Clock, Loader2, Paperclip, Send, StickyNote } from "lucide-react";
import { useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { initialState } from "@/lib/action";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Template } from "@/modules/channels/queries";
import { addNoteAction, sendMediaAction, sendTemplateAction, sendTextAction } from "../actions";

type Mode = "message" | "note";

const ACCEPT = ".jpg,.jpeg,.png,.pdf,.doc,.docx,.xls,.xlsx,.mp3,.ogg,.m4a,.mp4";
const MAX_UPLOAD = 16 * 1024 * 1024;

function safeName(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]/g, "_").slice(-80) || "arquivo";
}

type Props = {
  conversationId: string;
  organizationId: string;
  windowOpen: boolean;
  windowExpiresAt: string | null;
  templates: Template[];
  /** Motivo pelo qual o usuário não pode responder (ex.: conversa de outro atendente). */
  blockedReason: string | null;
  channelConnected: boolean;
  timeLabel: string | null;
};

export function Composer({ conversationId, organizationId, windowOpen, templates, blockedReason, channelConnected, timeLabel }: Props) {
  const [mode, setMode] = useState<Mode>("message");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const busy = pending || uploading;

  function submitText(event?: FormEvent) {
    event?.preventDefault();
    const body = text.trim();
    if (body === "" || busy) return;
    setError(null);
    const formData = new FormData();
    formData.set("body", body);
    startTransition(async () => {
      const action = mode === "note" ? addNoteAction : sendTextAction;
      const result = await action(conversationId, initialState, formData);
      if (result.ok) setText("");
      else setError(result.error ?? "Não foi possível enviar.");
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submitText();
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_UPLOAD) {
      setError("O arquivo excede 16 MB.");
      return;
    }
    setUploading(true);
    try {
      // O arquivo vai direto para a pasta da agência no bucket privado; o servidor valida o conteúdo antes de enviar.
      const path = `${organizationId}/whatsapp/outbox/${crypto.randomUUID()}-${safeName(file.name)}`;
      const { error: uploadError } = await createClient().storage.from("media").upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (uploadError) {
        setError("Não foi possível enviar o arquivo. Verifique o tipo e o tamanho.");
        return;
      }
      const result = await sendMediaAction(conversationId, path, text.trim());
      if (result.ok) {
        setText("");
        toast.success("Arquivo enviado.");
      } else {
        setError(result.error ?? "Não foi possível enviar o arquivo.");
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const canMessage = channelConnected && !blockedReason;
  const showTemplates = mode === "message" && canMessage && !windowOpen;

  return (
    <div className={cn("border-t bg-surface px-3 pt-2.5 pb-3 transition-colors sm:px-4", mode === "note" ? "border-warning/30" : "border-line")}>
      <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Controle segmentado: botões com aria-pressed (não há painéis de abas separados). */}
        <div className="inline-flex rounded-md bg-muted p-0.5" role="group" aria-label="Tipo de envio">
          {(
            [
              ["message", "Mensagem", Send],
              ["note", "Nota interna", StickyNote],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => {
                setMode(value);
                setError(null);
              }}
              className={cn(
                "flex h-8 cursor-pointer items-center gap-1.5 rounded-sm px-3 text-label font-semibold transition-colors duration-150 max-md:h-touch max-md:px-4",
                mode === value
                  ? value === "note"
                    ? "bg-warning-soft text-warning shadow-card"
                    : "bg-surface text-fg shadow-card"
                  : "text-fg-muted hover:text-fg",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        {mode === "message" && canMessage && windowOpen && timeLabel ? (
          <span className="ml-auto flex items-center gap-1 text-xs text-fg-subtle">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Janela aberta até {timeLabel}
          </span>
        ) : null}
      </div>

      {error ? (
        <Alert tone="danger" className="mb-2">
          {error}
        </Alert>
      ) : null}

      {mode === "message" && !channelConnected ? (
        <Alert tone="warning">O número de WhatsApp desta conversa não está conectado. Um administrador pode reconectar em Configurações › Canais.</Alert>
      ) : mode === "message" && blockedReason ? (
        <Alert tone="info">{blockedReason}</Alert>
      ) : showTemplates ? (
        <TemplateForm conversationId={conversationId} templates={templates} />
      ) : (
        <form onSubmit={submitText} className="flex items-end gap-2">
          {mode === "message" ? (
            <>
              <input ref={fileRef} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => onFile(e.target.files?.[0])} />
              <Button
                variant="ghost"
                size="icon"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                aria-label="Anexar imagem, áudio ou documento"
                className="h-10 w-10 shrink-0 max-md:h-touch max-md:w-touch"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Paperclip className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </>
          ) : null}
          <label className="sr-only" htmlFor="composer-texto">
            {mode === "note" ? "Nota interna" : "Mensagem"}
          </label>
          <textarea
            id="composer-texto"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            maxLength={mode === "note" ? 4000 : 4096}
            placeholder={mode === "note" ? "Nota visível apenas para a equipe" : "Escreva uma mensagem. Enter envia, Shift+Enter quebra a linha."}
            className={cn("elz-field max-h-40 min-h-touch min-w-0 flex-1 resize-none", mode === "note" && "border-warning/40 bg-warning-soft")}
          />
          <Button
            type="submit"
            variant={mode === "note" ? "secondary" : "brand"}
            disabled={busy || text.trim() === ""}
            aria-busy={pending}
            aria-label={mode === "note" ? "Salvar nota" : "Enviar"}
            className="shrink-0 max-md:h-touch max-md:w-touch max-md:px-0"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            <span className="hidden md:inline">{mode === "note" ? "Salvar nota" : "Enviar"}</span>
          </Button>
        </form>
      )}
    </div>
  );
}

function TemplateForm({ conversationId, templates }: { conversationId: string; templates: Template[] }) {
  const usable = templates.filter((t) => t.spec.supported);
  const [selectedId, setSelectedId] = useState(usable[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const selected = usable.find((t) => t.id === selectedId);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await sendTemplateAction(conversationId, initialState, formData);
      if (result.ok) toast.success("Template enviado.");
      else setError(result.error ?? "Não foi possível enviar o template.");
    });
  }

  return (
    // Limita a altura para o histórico continuar visível; o formulário rola por dentro.
    <div className="max-h-72 space-y-3 overflow-y-auto overscroll-contain md:max-h-96">
      <Alert tone="warning" title="Fora da janela de 24 horas">
        A Meta só permite mensagens livres até 24 horas depois da última mensagem do cliente. Agora é possível enviar apenas um
        template aprovado; quando o cliente responder, a conversa livre volta a ficar disponível.
      </Alert>
      {usable.length === 0 ? (
        <p className="text-label text-fg-muted">
          Nenhum template aprovado disponível. Crie e aprove templates no Gerenciador do WhatsApp da Meta e sincronize em
          Configurações › Canais.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="space-y-1.5">
            <label htmlFor="template-select" className="block text-label font-semibold">
              Template aprovado
            </label>
            <select id="template-select" name="template_id" value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="elz-field">
              {usable.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.language})
                </option>
              ))}
            </select>
          </div>
          {selected ? (
            <>
              <p className="rounded-md bg-muted p-3 text-label whitespace-pre-line text-fg-muted">
                {[selected.spec.headerText, selected.spec.bodyText, selected.spec.footerText].filter(Boolean).join("\n\n")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2" key={selected.id}>
                {[...selected.spec.headerParams.map((p) => [`header_${p}`, `Cabeçalho {{${p}}}`] as const), ...selected.spec.bodyParams.map((p) => [`body_${p}`, `Variável {{${p}}}`] as const)].map(
                  ([name, label]) => (
                    <div key={name} className="space-y-1.5">
                      <label htmlFor={`tpl-${name}`} className="block text-label font-semibold">
                        {label}
                      </label>
                      <input id={`tpl-${name}`} name={name} required maxLength={1000} className="elz-field" />
                    </div>
                  ),
                )}
              </div>
            </>
          ) : null}
          <Button type="submit" variant="brand" disabled={pending || !selected} aria-busy={pending} className="max-md:h-touch max-md:w-full">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            Enviar template
          </Button>
        </form>
      )}
    </div>
  );
}
