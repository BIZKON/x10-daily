import { type Env as BaseEnv, loadEnv } from "@x10/config";
import type { PipelineBindings } from "./bindings";

/**
 * Pipeline worker env → @x10/config Zod-валидация.
 *
 * CRITICAL-4 из docs/SECURITY-AUDIT.md:
 * - loadEnv enforces INNGEST_SIGNING_KEY в production. Без него boot fails.
 * - AI_GATEWAY_API_KEY required в production (primary LLM auth). ANTHROPIC_*
 *   опционально (legacy direct fallback).
 *
 * Pipeline — фоновый воркер: JWT-сессий не выпускает → X10_JWT_SECRET ему не
 * нужен (он только у api/admin), а TELEGRAM_BOT_TOKEN опционален (post-to-tg
 * сам проверяет наличие). Поэтому productionRequired переопределяется на
 * pipeline-specific набор. БЕЗ этого override бэкграунд-функции падают в
 * проде на `loadEnv` с «missing X10_JWT_SECRET» — session 17 регрессия:
 * cron ingest-vc-rss молча умирал на каждом тике 15h (seen_items=0).
 */
export const PIPELINE_REQUIRED_KEYS = [
  "AI_GATEWAY_API_KEY",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
] as const satisfies ReadonlyArray<keyof BaseEnv>;

/**
 * NON-caching loader для Inngest-функций. Каждая функция получает `bindings`
 * как аргумент фабрики (для инъекции в тестах) → кэшировать НЕЛЬЗЯ, иначе
 * между тестами с разными bindings течёт первый env. Zod (z.object) сам
 * отбрасывает неизвестные ключи, поэтому raw bindings можно отдавать как есть.
 */
export function loadPipelineEnv(bindings: PipelineBindings): BaseEnv {
  return loadEnv(bindings as unknown as Record<string, string | undefined>, {
    requiredKeys: PIPELINE_REQUIRED_KEYS,
  });
}

/**
 * Кэширующий loader для долгоживущих хэндлеров (health endpoint в app.ts),
 * где bindings один на процесс — повторные парсы дёшевы, но лишние.
 */
let cached: BaseEnv | undefined;

export function getPipelineEnv(bindings: PipelineBindings): BaseEnv {
  if (cached) return cached;
  cached = loadPipelineEnv(bindings);
  return cached;
}

export type PipelineEnv = BaseEnv;
