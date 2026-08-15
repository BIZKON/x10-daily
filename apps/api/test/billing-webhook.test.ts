import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { AppBindings, RateLimiter } from "../src/bindings";
import { paymentIdFromNotification, storeConfigured } from "../src/routes/billing";

/**
 * Вебхук ЮKassa (спека 7).
 *
 * 🔴 Главное свойство здесь — «всегда 200». ЮKassa повторяет уведомление, пока
 * не получит успешный ответ, и очередь ретраев умеет жить сутками. Любая наша
 * ошибка обязана оставаться нашей: мусор, чужой платёж, отсутствующие ключи —
 * всё это 200 и запись в лог, а не 4xx/5xx.
 *
 * Зачисление на живой базе проверяется прогоном на проде: тестов с БД в этом
 * приложении нет, а имитация транзакции проверяла бы имитацию.
 */

const noopLimiter: RateLimiter = {
  async limit() {
    return { success: true };
  },
};

/** Без ключей ЮKassa: маршрут обязан отвечать 200 и не ходить ни в шлюз, ни в базу. */
const NO_STORE: AppBindings = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://test:test@localhost/test",
  ENGAGEMENT_LIMITER: noopLimiter,
  PIPELINE_LIMITER: noopLimiter,
};

function post(body: string, bindings: AppBindings = NO_STORE) {
  return createApp().fetch(
    new Request("https://x10-api.local/v1/billing/yookassa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
    bindings,
  );
}

describe("вебхук отвечает 200 на что угодно", () => {
  it("на нечитаемое тело", async () => {
    const res = await post("не json вовсе");
    expect(res.status).toBe(200);
  });

  it("на пустой объект", async () => {
    const res = await post("{}");
    expect(res.status).toBe(200);
  });

  it("на уведомление без id платежа", async () => {
    const res = await post(JSON.stringify({ event: "payment.succeeded", object: {} }));
    expect(res.status).toBe(200);
  });

  it("🔴 когда магазин не настроен — тоже 200", async () => {
    // Иначе ЮKassa будет ретраить сутками из-за нашей незаконченной настройки.
    const res = await post(
      JSON.stringify({ event: "payment.succeeded", object: { id: "pay_1", status: "succeeded" } }),
    );
    expect(res.status).toBe(200);
  });
});

describe("извлечение платежа из уведомления", () => {
  it("берёт id и событие", () => {
    expect(
      paymentIdFromNotification({
        event: "payment.succeeded",
        object: { id: "2f8e1a00-000f-5000-9000-1a2b3c4d5e6f" },
      }),
    ).toEqual({
      event: "payment.succeeded",
      providerPaymentId: "2f8e1a00-000f-5000-9000-1a2b3c4d5e6f",
    });
  });

  it("отменённый платёж — тоже событие, которое нас касается", () => {
    expect(paymentIdFromNotification({ event: "payment.canceled", object: { id: "p2" } })).toEqual({
      event: "payment.canceled",
      providerPaymentId: "p2",
    });
  });

  it("🔴 статус из тела уведомления не читаем вовсе", () => {
    // Адрес публичный, подписи у ЮKassa нет: кто угодно может прислать
    // «succeeded». Решение принимается только по ответу GET /v3/payments/{id}.
    const parsed = paymentIdFromNotification({
      event: "payment.succeeded",
      object: { id: "p3", status: "succeeded", paid: true, amount: { value: "350000.00" } },
    });
    expect(parsed).toEqual({ event: "payment.succeeded", providerPaymentId: "p3" });
  });

  it("чужое событие отбрасывается", () => {
    expect(
      paymentIdFromNotification({ event: "refund.succeeded", object: { id: "r1" } }),
    ).toBeNull();
  });

  it("мусор отбрасывается", () => {
    expect(paymentIdFromNotification(null)).toBeNull();
    expect(paymentIdFromNotification({ object: { id: "x" } })).toBeNull();
    expect(paymentIdFromNotification({ event: "payment.succeeded" })).toBeNull();
    expect(
      paymentIdFromNotification({ event: "payment.succeeded", object: { id: 42 } }),
    ).toBeNull();
  });
});

describe("магазин считается настроенным только при обоих ключах", () => {
  it("нет ключей — оплата выключена", () => {
    expect(storeConfigured({})).toBe(false);
  });

  it("🔴 половина ключей — тоже выключена", () => {
    // shopId без секрета даёт 401 на каждом платеже. Лучше честное «оплата не
    // настроена», чем кнопка, которая всегда ошибается.
    expect(storeConfigured({ YOOKASSA_SHOP_ID: "123" })).toBe(false);
    expect(storeConfigured({ YOOKASSA_SECRET_KEY: "live_x" })).toBe(false);
  });

  it("оба ключа — включена", () => {
    expect(storeConfigured({ YOOKASSA_SHOP_ID: "123", YOOKASSA_SECRET_KEY: "live_x" })).toBe(true);
  });

  it("пустые строки за ключи не считаются", () => {
    expect(storeConfigured({ YOOKASSA_SHOP_ID: "  ", YOOKASSA_SECRET_KEY: "live_x" })).toBe(false);
  });
});
