import type { Instrumentation } from "next";

/**
 * Monitoramento básico: todo erro não tratado do servidor vira uma linha JSON
 * no log (visível nos Logs da Vercel e exportável por Log Drain). O registro
 * leva rota e código do erro — nunca corpo de requisição, cookies ou tokens.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const err = error as { digest?: string; name?: string; code?: string };
  console.error(
    JSON.stringify({
      level: "error",
      source: "elozia",
      at: new Date().toISOString(),
      digest: err.digest ?? null,
      name: err.name ?? "Error",
      code: err.code ?? null,
      method: request.method,
      path: request.path.split("?")[0],
      route: context.routePath,
      kind: context.routeType,
    }),
  );
};
