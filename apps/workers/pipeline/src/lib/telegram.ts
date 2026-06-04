import { ProxyAgent, fetch as undiciFetch } from "undici";

/**
 * Тонкий клиент Telegram Bot API. Выделен из post-to-tg.ts (session 20), чтобы
 * и постинг статей, и $-алерты (ops-alert.ts) ходили одним путём.
 *
 * Сеть: на Timeweb ru-1 api.telegram.org доступен ТОЛЬКО по IPv6 (IPv4
 * 149.154.x молча фильтруется). NAT66 на docker-сети решает это для прямого
 * fetch — поэтому proxyUrl обычно пуст. proxyUrl оставлен как фолбэк на случай
 * локаций без IPv6 (undici.ProxyAgent, HTTP CONNECT). См. handoff-session-18 §2.
 */

const TG_API_BASE = "https://api.telegram.org";

interface TgOkResponse {
  ok: boolean;
  result?: { message_id: number };
  description?: string;
}

export type TgSendOpts = {
  /** Bot token `<id>:<secret>`. */
  token: string;
  /** HTTP/HTTPS-прокси для api.telegram.org. Пусто → прямой fetch (IPv6). */
  proxyUrl?: string;
  /** Инъекция fetch для тестов. Prod — резолв ниже (proxy или globalThis.fetch). */
  fetchImpl?: typeof fetch;
};

function resolveFetch(opts: TgSendOpts): typeof fetch {
  if (opts.fetchImpl) return opts.fetchImpl;
  const proxyUrl = opts.proxyUrl;
  if (proxyUrl) {
    return ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
      undiciFetch(input as Parameters<typeof undiciFetch>[0], {
        ...(init as Parameters<typeof undiciFetch>[1]),
        dispatcher: new ProxyAgent(proxyUrl),
      })) as unknown as typeof fetch;
  }
  return globalThis.fetch;
}

/** Низкоуровневый вызов любого метода Bot API. Бросает на !ok. */
export async function callTelegram(
  method: string,
  body: Record<string, unknown>,
  opts: TgSendOpts,
): Promise<{ ok: boolean; method: string; messageId: number | null }> {
  const fetchImpl = resolveFetch(opts);
  const url = `${TG_API_BASE}/bot${opts.token}/${method}`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as TgOkResponse;
  if (!res.ok || !json.ok) {
    throw new Error(`Telegram API ${method} failed: HTTP ${res.status} ${json.description ?? ""}`);
  }
  return { ok: json.ok, method, messageId: json.result?.message_id ?? null };
}

/** sendMessage — текстовое сообщение в чат/канал. */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  opts: TgSendOpts,
): Promise<{ ok: boolean; method: string; messageId: number | null }> {
  return callTelegram("sendMessage", { chat_id: chatId, text }, opts);
}
