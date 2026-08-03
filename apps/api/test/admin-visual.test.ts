import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { AppBindings, RateLimiter } from "../src/bindings";

const noopLimiter: RateLimiter = {
  async limit() {
    return { success: true };
  },
};

const TEST_BINDINGS: AppBindings = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://test:test@localhost/test",
  ENGAGEMENT_LIMITER: noopLimiter,
  PIPELINE_LIMITER: noopLimiter,
};

const ARTICLE_ID = "00000000-0000-4000-8000-000000000001";
const BASE = "https://x10-api.local/v1/admin/visuals";

function call(path: string, init?: RequestInit) {
  return createApp().fetch(new Request(`${BASE}${path}`, init), TEST_BINDINGS);
}

/**
 * HumanGate на картинку — контур безопасности: без роли редактора обложку
 * нельзя ни увидеть, ни одобрить. Проверяем ИМЕННО отказ до похода в БД
 * (DATABASE_URL здесь фиктивный: если бы гард пропустил, тест упал бы на сети).
 */
describe("admin-visual — авторизация", () => {
  it("очередь ревью без Authorization → не 200", async () => {
    const res = await call("?status=pending_review");
    expect(res.status).not.toBe(200);
    expect([401, 403, 503]).toContain(res.status);
  });

  it("🔴 approve без Authorization → не 200 (AI не публикует сам)", async () => {
    const res = await call(`/${ARTICLE_ID}/approve`, { method: "POST" });
    expect(res.status).not.toBe(200);
    expect([401, 403, 503]).toContain(res.status);
  });

  it("reject без Authorization → не 200", async () => {
    const res = await call(`/${ARTICLE_ID}/reject`, { method: "POST" });
    expect(res.status).not.toBe(200);
    expect([401, 403, 503]).toContain(res.status);
  });

  it("regenerate без Authorization → не 200 (иначе кто угодно жжёт бюджет)", async () => {
    const res = await call(`/${ARTICLE_ID}/regenerate`, { method: "POST" });
    expect(res.status).not.toBe(200);
    expect([401, 403, 503]).toContain(res.status);
  });

  it("Bearer-мусор не принимается", async () => {
    const res = await call(`/${ARTICLE_ID}/approve`, {
      method: "POST",
      headers: { Authorization: "Bearer not-a-jwt" },
    });
    expect(res.status).not.toBe(200);
  });
});

describe("admin-visual — валидация входа", () => {
  it("битый uuid в пути отвергается схемой", async () => {
    const res = await call("/not-a-uuid/approve", { method: "POST" });
    expect(res.status).toBe(400);
  });

  it("неизвестный статус в очереди отвергается схемой", async () => {
    const res = await call("?status=всё-подряд");
    expect(res.status).toBe(400);
  });

  it("limit вне диапазона отвергается", async () => {
    const res = await call("?limit=9999");
    expect(res.status).toBe(400);
  });

  it("маршруты смонтированы (не 404)", async () => {
    const res = await call(`/${ARTICLE_ID}/approve`, { method: "POST" });
    expect(res.status).not.toBe(404);
  });
});
