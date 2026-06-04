import type { Env } from "@x10/config";
import { sendTelegramMessage } from "./telegram";

/**
 * Best-effort ops-алерт в Telegram (session 20 hardening). Используется
 * $-мониторингом draft-article (warn / exhausted).
 *
 * Контракт: НИКОГДА не бросает — сбой доставки алерта не должен ронять
 * pipeline-шаг (иначе ретраи Inngest + потенциальный дабл-расход). При
 * отсутствии TG_OPS_CHAT_ID или TELEGRAM_BOT_TOKEN деградирует до console.warn,
 * чтобы алерт всё равно был виден в `docker compose logs pipeline`.
 *
 * Канал намеренно ОТДЕЛЬНЫЙ (TG_OPS_CHAT_ID), не контент-канал
 * (TG_TEST_CHANNEL_ID) — ops-шум не должен попадать в публикации.
 */
export async function sendOpsAlert(env: Env, text: string): Promise<void> {
  const chatId = env.TG_OPS_CHAT_ID;
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!chatId || !token) {
    const why = !chatId ? "TG_OPS_CHAT_ID не задан" : "TELEGRAM_BOT_TOKEN не задан";
    console.warn(`[ops-alert] ${text} (${why} → только лог)`);
    return;
  }
  try {
    await sendTelegramMessage(chatId, text, {
      token,
      proxyUrl: env.TELEGRAM_PROXY_URL || undefined,
    });
  } catch (e) {
    console.error(
      `[ops-alert] не доставлен в Telegram: ${e instanceof Error ? e.message : String(e)} — текст: ${text}`,
    );
  }
}
