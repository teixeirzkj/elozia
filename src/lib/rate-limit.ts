import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";

/**
 * Rate limiting por janela deslizante.
 * Com Upstash configurado, o limite vale para todas as instâncias. Sem ele, usa
 * um contador em memória (suficiente em desenvolvimento; em produção é apenas
 * uma proteção parcial e gera aviso no log).
 */

export type LimitName = "auth" | "invite" | "message" | "upload" | "import" | "export";

const LIMITS: Record<LimitName, { max: number; windowSec: number }> = {
  auth: { max: 8, windowSec: 60 },
  invite: { max: 20, windowSec: 3600 },
  message: { max: 60, windowSec: 60 },
  upload: { max: 30, windowSec: 60 },
  import: { max: 5, windowSec: 600 },
  export: { max: 20, windowSec: 600 },
};

let redis: Redis | null | undefined;
const limiters = new Map<LimitName, Ratelimit>();
const memory = new Map<string, number[]>();
let warned = false;

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

export function memoryLimit(key: string, max: number, windowSec: number, now = Date.now()): boolean {
  const from = now - windowSec * 1000;
  const hits = (memory.get(key) ?? []).filter((t) => t > from);
  if (hits.length >= max) {
    memory.set(key, hits);
    return false;
  }
  hits.push(now);
  memory.set(key, hits);
  if (memory.size > 5000) {
    for (const [k, v] of memory) if (v.every((t) => t <= from)) memory.delete(k);
  }
  return true;
}

/** Devolve true quando a ação é permitida. */
export async function rateLimit(name: LimitName, key: string): Promise<boolean> {
  const { max, windowSec } = LIMITS[name];
  const client = getRedis();
  if (!client) {
    if (process.env.NODE_ENV === "production" && !warned) {
      warned = true;
      console.warn("[rate-limit] Upstash não configurado: usando limite em memória por instância.");
    }
    return memoryLimit(`${name}:${key}`, max, windowSec);
  }
  let limiter = limiters.get(name);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(max, `${windowSec} s`),
      prefix: `elozia:${name}`,
    });
    limiters.set(name, limiter);
  }
  try {
    const { success } = await limiter.limit(key);
    return success;
  } catch (error) {
    console.error("[rate-limit] falha no Upstash", (error as Error).message);
    return memoryLimit(`${name}:${key}`, max, windowSec);
  }
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
}

export const RATE_LIMITED_MESSAGE = "Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.";
