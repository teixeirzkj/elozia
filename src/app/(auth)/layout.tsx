import type { ReactNode } from "react";
import { MessageCircle, SquareKanban, Workflow, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/layout/logo";

const FEATURES: Array<{ icon: LucideIcon; title: string; text: string }> = [
  {
    icon: MessageCircle,
    title: "Atendimento pelo WhatsApp oficial",
    text: "As conversas da API oficial do WhatsApp chegam numa caixa de entrada só, junto com o histórico do contato.",
  },
  {
    icon: SquareKanban,
    title: "Funil de vendas e catálogo de viagens",
    text: "Acompanhe cada oportunidade por etapa e ligue a ela os pacotes e as saídas do seu catálogo.",
  },
  {
    icon: Workflow,
    title: "Automações de follow-up",
    text: "Mensagens programadas por gatilho retomam o contato no momento certo, sem depender de lembrete manual.",
  },
];

/**
 * Moldura das telas de autenticação.
 * Celular e tablet: faixa escura com o logo acima do formulário.
 * Desktop (lg+): painel escuro à esquerda com a proposta do produto e o formulário à direita.
 * Há um único logo na página, que muda de papel conforme a largura.
 * O painel não é fixo (sticky): em telas baixas ele cresce com o conteúdo em vez de cortá-lo.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative isolate flex flex-col overflow-hidden bg-topbar text-topbar-fg lg:min-h-dvh">
        <RouteDecoration />

        <div className="relative flex flex-1 flex-col px-4 py-5 sm:px-8 lg:px-12 lg:py-12 xl:px-16">
          <Logo onDark className="w-32 lg:w-40" />
          <p className="mt-2 text-label text-topbar-fg lg:mt-4 lg:text-body">CRM inteligente para agências de viagens</p>

          <div className="mt-auto hidden pt-12 lg:block">
            <p className="max-w-md text-display font-bold tracking-tight text-topbar-fg-strong">
              Do primeiro “oi” no WhatsApp à viagem vendida, num só lugar.
            </p>
            <ul className="mt-8 max-w-md space-y-6">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-topbar-line bg-topbar-active text-brand"
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-title font-semibold text-topbar-fg-strong">{title}</p>
                    <p className="mt-1 text-body text-topbar-fg">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-12 hidden text-label text-topbar-fg lg:block">© Elozia</p>
        </div>
      </aside>

      <main className="flex flex-col items-center px-4 py-8 sm:px-8 sm:py-12 lg:justify-center lg:py-12">
        <div className="w-full max-w-md animate-rise-in">
          <div className="rounded-xl border border-line bg-surface p-5 shadow-float sm:p-8">{children}</div>
        </div>
      </main>
    </div>
  );
}

/** Rota pontilhada em verde e um brilho suave, só decorativos. */
function RouteDecoration() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand/15 blur-3xl lg:-top-32 lg:-right-32 lg:h-96 lg:w-96" />
      <div className="absolute -bottom-40 -left-40 hidden h-96 w-96 rounded-full bg-brand/10 blur-3xl lg:block" />
      <svg
        viewBox="0 0 400 260"
        fill="none"
        preserveAspectRatio="xMaxYMid meet"
        className="absolute top-0 right-0 h-full w-3/5 text-brand opacity-60 sm:w-2/5 lg:top-8 lg:h-auto lg:w-full lg:opacity-70"
      >
        <path
          d="M24 222 C 96 210, 120 120, 196 132 S 300 196, 340 92 S 372 40, 384 30"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="0.5 10"
        />
        <circle cx="24" cy="222" r="4" fill="currentColor" />
        <circle cx="196" cy="132" r="3" fill="currentColor" opacity="0.7" />
        <circle cx="384" cy="30" r="11" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
        <circle cx="384" cy="30" r="4.5" fill="currentColor" />
      </svg>
    </div>
  );
}
