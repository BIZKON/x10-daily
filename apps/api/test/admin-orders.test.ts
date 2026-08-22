import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { AppBindings, RateLimiter } from "../src/bindings";

/**
 * Заказы — общий список и заведение без партнёра (спека 7 §5.2).
 *
 * 🔴 Продажа владельца напрямую — это ТОТ ЖЕ заказ с той же ссылкой и тем же
 * счётом, а не отдельная ветка кода. Разница ровно одна: начислять некому.
 * Поэтому маршрут один, а партнёр в нём необязателен.
 *
 * Проверяем ворота: посторонний не видит чужую воронку продаж и не заводит
 * заказ на произвольную сумму.
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

const BASE = "https://x10-api.local/v1/admin/orders";

function call(init?: RequestInit) {
  return createApp().fetch(new Request(BASE, init), TEST_BINDINGS);
}

function create(body: unknown) {
  return call({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID = { clientName: "ООО «Ромашка»", package: "line", amountRub: 350_000 };

describe("список заказов закрыт от посторонних", () => {
  it("🔴 без входа воронка продаж не отдаётся", async () => {
    expect((await call()).status).toBe(401);
  });
});

describe("заказ без партнёра — тот же заказ", () => {
  it("без входа заказ не завести", async () => {
    expect((await create(VALID)).status).toBe(401);
  });

  it("партнёр необязателен: владелец продаёт сам", async () => {
    // Гейт прав срабатывает уже ПОСЛЕ разбора тела — значит тело принято.
    expect((await create({ ...VALID, partnerId: null })).status).toBe(401);
  });

  it("выдуманный пакет не принимается", async () => {
    expect((await create({ ...VALID, package: "золотой" })).status).toBe(400);
  });

  it("нулевая сумма не заказ", async () => {
    expect((await create({ ...VALID, amountRub: 0 })).status).toBe(400);
  });

  it("клиент обязателен: заказ без имени некому выставить", async () => {
    expect((await create({ package: "line", amountRub: 350_000 })).status).toBe(400);
  });

  it("партнёр — это uuid, а не имя", async () => {
    expect((await create({ ...VALID, partnerId: "Костя" })).status).toBe(400);
  });
});
