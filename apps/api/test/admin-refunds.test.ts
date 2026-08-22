import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { AppBindings, RateLimiter } from "../src/bindings";

/**
 * Возврат денег клиенту — маршрут админки (спека 7 §11).
 *
 * Проверяем ворота, а не проводку: сторно двигает чужие деньги в минус, поэтому
 * без прав туда нельзя, а сумма обязана быть настоящей. Сама транзакция
 * проверяется живым прогоном: тестов с БД в этом приложении нет, а имитация
 * транзакции проверяла бы имитацию.
 */

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

const DEAL = "00000000-0000-4000-8000-000000000001";

function refund(body: unknown, init?: RequestInit) {
  return createApp().fetch(
    new Request(`https://x10-api.local/v1/admin/deals/${DEAL}/refunds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...init,
    }),
    TEST_BINDINGS,
  );
}

describe("сторно закрыто от посторонних", () => {
  it("🔴 без входа возврат не оформить", async () => {
    // Публичный возврат — это чужие деньги в минус по чужой ссылке.
    const res = await refund({ amountRub: 10 });
    expect(res.status).toBe(401);
  });
});

describe("сумма возврата проверяется до базы", () => {
  it("ноль возвратом не считается", async () => {
    const res = await refund({ amountRub: 0 });
    expect(res.status).toBe(400);
  });

  it("🔴 отрицательная сумма запрещена", async () => {
    // Минус на минус вернул бы партнёру комиссию за возврат.
    const res = await refund({ amountRub: -1000 });
    expect(res.status).toBe(400);
  });

  it("сумма обязательна", async () => {
    const res = await refund({ note: "клиент передумал" });
    expect(res.status).toBe(400);
  });
});
