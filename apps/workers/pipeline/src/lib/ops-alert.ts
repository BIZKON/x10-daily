import type { Env } from "@x10/config";
import type { Database } from "@x10/db";
import {
  type AlertKind,
  type PendingAlert,
  claimAlert,
  markAlertDelivered,
  recordAlertAttempt,
} from "./cost-ledger";
import { sendTelegramMessage } from "./telegram";

/**
 * Доставка ops-алертов в Telegram (session 20 + M4 hardening). Используется
 * $-мониторингом draft-article (warn / exhausted) и cron'ом retry-ops-alerts.
 *
 * Контракт: НИКОГДА не бросает — сбой доставки алерта не должен ронять
 * pipeline-шаг (иначе ретраи Inngest + возможный дабл-расход / непубликация
 * статьи, т.к. budget-warn-alert стоит перед notify-ready). Вместо throw
 * возвращаем результат, а недоставленные алерты дослыает sweeper.
 *
 * Канал намеренно ОТДЕЛЬНЫЙ (TG_OPS_CHAT_ID), не контент-канал
 * (TG_TEST_CHANNEL_ID) — ops-шум не должен попадать в публикации.
 */

export type OpsSendResult = { delivered: true } | { delivered: false; reason: string };

/**
 * Одна попытка отправить текст в ops-чат. При отсутствии TG_OPS_CHAT_ID /
 * TELEGRAM_BOT_TOKEN деградирует до console.warn (алерт виден в `docker compose
 * logs pipeline`) и возвращает delivered:false → sweeper попробует позже, когда
 * конфиг появится.
 */
export async function sendOpsAlert(env: Env, text: string): Promise<OpsSendResult> {
  const chatId = env.TG_OPS_CHAT_ID;
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!chatId || !token) {
    const why = !chatId ? "TG_OPS_CHAT_ID не задан" : "TELEGRAM_BOT_TOKEN не задан";
    console.warn(`[ops-alert] ${text} (${why} → только лог)`);
    return { delivered: false, reason: why };
  }
  try {
    await sendTelegramMessage(chatId, text, {
      token,
      proxyUrl: env.TELEGRAM_PROXY_URL || undefined,
    });
    return { delivered: true };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.error(`[ops-alert] не доставлен в Telegram: ${reason} — текст: ${text}`);
    return { delivered: false, reason };
  }
}

/** Инъекция отправки для тестов (по умолчанию — реальный sendOpsAlert). */
type SendFn = (env: Env, text: string) => Promise<OpsSendResult>;

/**
 * Одна попытка доставки заклеймленного алерта + бухгалтерия M4: успех →
 * markAlertDelivered (выходит из очереди sweeper'а); провал → recordAlertAttempt
 * (attempts += 1, last_error). Никогда не бросает. Возвращает true при доставке.
 */
export async function attemptDelivery(
  db: Database,
  env: Env,
  alert: PendingAlert,
  send: SendFn = sendOpsAlert,
): Promise<boolean> {
  const res = await send(env, alert.message);
  if (res.delivered) {
    await markAlertDelivered(db, alert.id);
    return true;
  }
  await recordAlertAttempt(db, alert.id, res.reason);
  return false;
}

/**
 * Заклеймить алерт за (день, порог) и сразу попытаться доставить (быстрый путь).
 * Если send падает — строка остаётся delivered_at IS NULL и её дослыает cron
 * retry-ops-alerts. Идемпотентно: на конфликте (уже заклеймлен сегодня)
 * возвращает claimed:false и НЕ слёт повторно.
 */
export async function deliverOpsAlert(
  db: Database,
  env: Env,
  params: { day: string; kind: AlertKind; spendUsd: number; message: string },
  send: SendFn = sendOpsAlert,
): Promise<{ claimed: boolean; delivered: boolean }> {
  const id = await claimAlert(db, params.day, params.kind, params.spendUsd, params.message);
  if (!id) return { claimed: false, delivered: false };
  const delivered = await attemptDelivery(db, env, { id, message: params.message }, send);
  return { claimed: true, delivered };
}
