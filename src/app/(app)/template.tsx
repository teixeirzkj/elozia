import type { ReactNode } from "react";

/**
 * Remontado a cada navegação: a página entra com um esmaecimento curto
 * (desligado para quem pediu menos movimento, pela regra global do CSS).
 * Só opacidade, de propósito: um `transform` aqui viraria o bloco de
 * referência dos filhos `position: fixed` (a moldura da central de
 * atendimento some enquanto a animação roda, porque este invólucro tem
 * altura zero quando o conteúdo é todo fixo).
 */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="animate-fade-in">{children}</div>;
}
