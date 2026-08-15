import { Hono } from "hono";
import type { AppEnv } from "../app";
import { getDb } from "../db";
import { getEnv } from "../env";
import { markPaymentCanceled, settleProviderPayment } from "../lib/payment-settle";
import { type YooKassaCreds, getPayment } from "../lib/yookassa";

/**
 * Входящая дверь от ЮKassa (спека 7).
 *
 * 🔴 Три правила, без которых её нельзя выпускать:
 *
 * 1. **Всегда 200.** ЮKassa повторяет уведомление, пока не получит успешный
 *    ответ. Наша ошибка, чужой платёж, мусор в теле — всё это 200 и запись в
 *    лог. Ответ 500 превращает одну проблему в очередь ретраев на сутки.
 * 2. **Телу уведомления не верим.** Адрес публичный, подписи у ЮKassa нет:
 *    прислать «succeeded» может кто угодно. Решение о деньгах принимается
 *    только по ответу `GET /v3/payments/{id}`.
 * 3. **Платёж должен быть наш.** Зачисление идёт по строке в нашей таблице —
 *    чужой id не найдётся и ничего не сдвинет.
 *
 * ⚠️ Rate limiter здесь намеренно НЕ стоит: 429 для ЮKassa — это повод
 * повторить, то есть лимит превратился бы в ускоритель.
 */

/** Событие, которое нас касается, и id платежа. Всё прочее — мусор. */
export function paymentIdFromNotification(
  body: unknown,
): { event: "payment.succeeded" | "payment.canceled"; providerPaymentId: string } | null {
  if (!body || typeof body !== "object") return null;
  const { event, object } = body as { event?: unknown; object?: unknown };

  if (event !== "payment.succeeded" && event !== "payment.canceled") return null;
  if (!object || typeof object !== "object") return null;

  const id = (object as { id?: unknown }).id;
  if (typeof id !== "string" || id.length === 0) return null;

  // Статус из тела не берём вовсе — он ничего не доказывает.
  return { event, providerPaymentId: id };
}

/** Настроен ли магазин: нужны ОБА ключа одного магазина. */
export function storeConfigured(env: {
  YOOKASSA_SHOP_ID?: string;
  YOOKASSA_SECRET_KEY?: string;
}): boolean {
  return Boolean(env.YOOKASSA_SHOP_ID?.trim() && env.YOOKASSA_SECRET_KEY?.trim());
}

/** Ключи магазина или null, если оплата не настроена. */
export function readCreds(env: {
  YOOKASSA_SHOP_ID?: string;
  YOOKASSA_SECRET_KEY?: string;
}): YooKassaCreds | null {
  if (!storeConfigured(env)) return null;
  return {
    shopId: (env.YOOKASSA_SHOP_ID ?? "").trim(),
    secretKey: (env.YOOKASSA_SECRET_KEY ?? "").trim(),
  };
}

export const billingRoute = new Hono<AppEnv>().post("/yookassa", async (c) => {
  try {
    const env = getEnv(c.env);
    const creds = readCreds(env);
    if (!creds) {
      console.warn("[billing] уведомление ЮKassa при ненастроенном магазине — пропущено");
      return c.json({ ok: true });
    }

    const parsed = paymentIdFromNotification(await c.req.json().catch(() => null));
    if (!parsed) return c.json({ ok: true });

    // Перепроверка у шлюза — единственный источник истины о статусе.
    const payment = await getPayment(creds, parsed.providerPaymentId);
    const db = getDb(env.DATABASE_URL);

    if (payment.status === "canceled") {
      await markPaymentCanceled(db, parsed.providerPaymentId);
      return c.json({ ok: true });
    }

    if (payment.status !== "succeeded" || !payment.paid) {
      // Платёж ещё в работе: ЮKassa пришлёт следующее уведомление сама.
      return c.json({ ok: true });
    }

    const result = await settleProviderPayment(db, parsed.providerPaymentId);

    if (!result.ok) {
      // `already_credited` — нормальный повтор, а вот `unknown_payment` значит,
      // что на наш адрес пришло чужое уведомление: это стоит видеть в логах.
      console.warn(`[billing] платёж ${parsed.providerPaymentId} не зачтён: ${result.reason}`);
      return c.json({ ok: true });
    }

    if (result.purpose === "entry" && result.dealResult?.ok) {
      const accrued = result.dealResult.accruals.length;
      console.info(
        `[billing] заказ оплачен: платёж ${parsed.providerPaymentId}, начислений ${accrued}`,
      );
    }

    return c.json({ ok: true });
  } catch (err) {
    // 🔴 Ошибка остаётся нашей. Отдать 500 значит попросить ЮKassa повторять
    // это уведомление, пока мы чиним, — и получить лавину, когда починим.
    console.error("[billing] уведомление ЮKassa не обработано:", err);
    return c.json({ ok: true });
  }
});
