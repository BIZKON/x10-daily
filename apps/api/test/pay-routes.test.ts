import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { AppBindings, RateLimiter } from "../src/bindings";
import { generatePayToken } from "../src/lib/pay-token";

/**
 * Публичная страница оплаты (спека 7).
 *
 * Проверяем ворота: что отсекается ДО базы и что происходит без настроенного
 * магазина. Сам заказ читается из живой базы — это проверяется прогоном на
 * проде, а не имитацией.
 */

const noopLimiter: RateLimiter = {
  async limit() {
    return { success: true };
  },
};

const BINDINGS: AppBindings = {
  NODE_ENV: "development",
  // Ключей ЮKassa нет: маршруты обязаны отвечать раньше, чем полезут в базу.
  DATABASE_URL: "postgresql://test:test@localhost/test",
  ENGAGEMENT_LIMITER: noopLimiter,
  PIPELINE_LIMITER: noopLimiter,
};

const call = (path: string, init?: RequestInit) =>
  createApp().fetch(new Request(`https://x10-api.local${path}`, init), BINDINGS);

const postJson = (path: string, body: unknown) =>
  call(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("мусорный код ссылки отсекается до базы", () => {
  it("короткий", async () => {
    expect((await call("/v1/pay/коротко")).status).toBe(404);
  });

  it("с обходом каталога", async () => {
    expect((await call("/v1/pay/..%2F..%2Fetc")).status).toBe(404);
  });

  it("кириллический — такой токен мы не выдаём", async () => {
    // Кириллица в адресе превращается в процентное кодирование, и ссылка,
    // пересланная клиенту как есть, ломается. Поэтому её и не бывает.
    expect((await call("/v1/pay/заказномер1042")).status).toBe(404);
  });

  it("слишком длинный", async () => {
    expect((await call(`/v1/pay/${"a".repeat(64)}`)).status).toBe(404);
  });
});

describe("оплата картой при ненастроенном магазине", () => {
  it("🔴 отвечает «запросите счёт», а не молчит и не падает", async () => {
    // Клиент не должен упереться в пустую кнопку: безнал работает и без ключей.
    const res = await postJson(`/v1/pay/${generatePayToken()}/start`, {
      payerEmail: "buh@romashka.ru",
      offerAccepted: true,
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("store_not_configured");
    expect(body.message).toContain("счёт");
  });

  it("без согласия с офертой платёж не начинается", async () => {
    // Продажа на 350 000 ₽ без зафиксированного акцепта недоказуема.
    const res = await postJson(`/v1/pay/${generatePayToken()}/start`, {
      payerEmail: "buh@romashka.ru",
      offerAccepted: false,
    });
    expect(res.status).toBe(400);
  });

  it("без почты платёж не начинается: касса не выбьет чек", async () => {
    const res = await postJson(`/v1/pay/${generatePayToken()}/start`, {
      offerAccepted: true,
    });
    expect(res.status).toBe(400);
  });
});

describe("реквизиты юрлица", () => {
  it("ИНН проверяется по длине", async () => {
    const res = await postJson(`/v1/pay/${generatePayToken()}/company`, {
      payerName: "ООО «Ромашка»",
      payerInn: "77012345",
    });
    expect(res.status).toBe(400);
  });
});
