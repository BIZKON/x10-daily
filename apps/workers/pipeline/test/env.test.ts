import { loadEnv } from "@x10/config";
import { describe, expect, it } from "vitest";
import type { PipelineBindings } from "../src/bindings";
import { PIPELINE_REQUIRED_KEYS, loadPipelineEnv } from "../src/env";

/**
 * Регрессия session 17→18.
 *
 * Pipeline-функции звали bare `loadEnv(bindings)` без requiredKeys-override →
 * в production падали на «missing X10_JWT_SECRET»: фоновый воркер JWT-сессий
 * не выпускает, поэтому X10_JWT_SECRET ему не маппится в bindings (server.ts
 * readBindings), а дефолтный productionRequired его требует. Итог: cron
 * ingest-vc-rss молча умирал на КАЖДОМ тике 15 часов (seen_items=0,
 * pipeline_runs=0) — автономный конвейер не работал вообще.
 *
 * Существующие тесты не ловили: все идут под NODE_ENV="test", где
 * production-ветка loadEnv (env.ts) не исполняется. Этот тест держит контракт
 * именно под NODE_ENV="production".
 */

// Минимальный production-env воркера: НЕТ X10_JWT_SECRET, НЕТ TELEGRAM_BOT_TOKEN.
const PROD_PIPELINE_BINDINGS = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://u:p@db:5432/x10",
  AI_GATEWAY_API_KEY: "tw-key",
  INNGEST_EVENT_KEY: "evt-key",
  INNGEST_SIGNING_KEY: "signkey-1234567890",
} as unknown as PipelineBindings;

describe("loadPipelineEnv — production requiredKeys override", () => {
  it("грузится в production БЕЗ X10_JWT_SECRET и TELEGRAM_BOT_TOKEN", () => {
    const env = loadPipelineEnv(PROD_PIPELINE_BINDINGS);
    expect(env.NODE_ENV).toBe("production");
    expect(env.AI_GATEWAY_API_KEY).toBe("tw-key");
    // Воркеру эти ключи не нужны — их отсутствие НЕ должно ронять boot/тик.
    expect(env.X10_JWT_SECRET).toBeUndefined();
    expect(env.TELEGRAM_BOT_TOKEN).toBeUndefined();
  });

  it("bare loadEnv(те же bindings) ПАДАЕТ на X10_JWT_SECRET — почему нужен override", () => {
    expect(() =>
      loadEnv(PROD_PIPELINE_BINDINGS as unknown as Record<string, string | undefined>),
    ).toThrow(/X10_JWT_SECRET/);
  });

  it("PIPELINE_REQUIRED_KEYS не требует session-секретов, но требует критичные воркеру", () => {
    expect(PIPELINE_REQUIRED_KEYS).not.toContain("X10_JWT_SECRET");
    expect(PIPELINE_REQUIRED_KEYS).not.toContain("TELEGRAM_BOT_TOKEN");
    expect(PIPELINE_REQUIRED_KEYS).toContain("AI_GATEWAY_API_KEY");
    expect(PIPELINE_REQUIRED_KEYS).toContain("INNGEST_EVENT_KEY");
    expect(PIPELINE_REQUIRED_KEYS).toContain("INNGEST_SIGNING_KEY");
  });

  /**
   * review session 21 [1] (CRITICAL). docker-compose инъектит `${VK_OWNER_ID:-}`
   * = "" (present-but-empty) когда оператор не задал VK — дефолтный «VK выключен».
   * `.optional()` пропускает ТОЛЬКО undefined, не пустую строку → без union с
   * literal("") regex VK_OWNER_ID падал бы на "", а loadPipelineEnv зовётся в
   * начале КАЖДОЙ Inngest-функции → крах всего pipeline-воркера на старте.
   */
  it("пустая строка VK_* (дефолтный «VK выключен» из compose) НЕ роняет loadEnv", () => {
    const env = loadPipelineEnv({
      ...PROD_PIPELINE_BINDINGS,
      VK_ACCESS_TOKEN: "",
      VK_OWNER_ID: "",
    } as unknown as PipelineBindings);
    expect(env.VK_OWNER_ID).toBe("");
    expect(env.VK_ACCESS_TOKEN).toBe("");
  });

  it("валидный VK_OWNER_ID проходит; нечисловой мусор — падает (fail-fast)", () => {
    const ok = loadPipelineEnv({
      ...PROD_PIPELINE_BINDINGS,
      VK_OWNER_ID: "-123456",
    } as unknown as PipelineBindings);
    expect(ok.VK_OWNER_ID).toBe("-123456");
    expect(() =>
      loadPipelineEnv({
        ...PROD_PIPELINE_BINDINGS,
        VK_OWNER_ID: "not-a-number",
      } as unknown as PipelineBindings),
    ).toThrow(/VK_OWNER_ID/);
  });
});
