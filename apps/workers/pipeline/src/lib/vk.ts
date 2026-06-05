/**
 * Тонкий клиент VK API (метод wall.post) — автопостинг на стену сообщества.
 * Зеркало lib/telegram.ts для VK-ветки конвейера (session 21).
 *
 * Сеть: VK — российский сервис, api.vk.com доступен из РФ-ЦОД по обычному
 * HTTPS/IPv4. НИ IPv6, НИ прокси не нужны (в отличие от api.telegram.org, см.
 * lib/telegram.ts). Поэтому клиент проще: globalThis.fetch напрямую.
 *
 * Авторизация: access_token сообщества (с правом `wall`) ИЛИ пользователя-
 * администратора группы (scope `wall,groups`, offline). Токен передаётся в теле
 * POST (form-urlencoded), не в URL — не попадает в access-логи.
 */

const VK_API_BASE = "https://api.vk.com/method";
/** Версия VK API. Фиксируем — VK ломает поведение между версиями. */
const VK_API_VERSION = "5.199";

/**
 * Ошибка VK с кодом. `code` = error_code из тела ответа VK; `code=0` —
 * транспортная/edge-ошибка (не-200 HTTP или неожиданный ответ), не VK API.
 */
export class VkApiError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "VkApiError";
  }
}

/**
 * VK error_code, на которых ретрай бесполезен или ВРЕДЕН (review session 21 [3]):
 *  - 14 — нужна captcha (авто-решить нельзя; ретрай долбит community-токен);
 *  - 9  — flood control (слишком часто / дубль);
 *  - 15, 200, 214 — доступ к стене запрещён (конфиг неверный — ретрай не поможет).
 * post-to-vk на этих кодах НЕ ретраит, а возвращает failed (см. post-to-vk.ts).
 */
export const NON_RETRYABLE_VK_CODES = new Set([9, 14, 15, 200, 214]);

export type VkPostOpts = {
  /** VK access token (community/user с правом wall). */
  accessToken: string;
  /** owner_id стены: "-123456" для сообщества, "123456" для пользователя. */
  ownerId: string;
  /**
   * Идемпотентность (review session 21 [2]): VK дедуплицирует wall.post по guid в
   * окне ~1ч → ретрай Inngest-шага (VK закоммитил пост, но чтение ответа упало)
   * НЕ создаёт дубль на стене. Передаём id статьи без дефисов (≤36 знаков —
   * лимит guid у VK).
   */
  guid?: string;
  /** Инъекция fetch для тестов. Prod — globalThis.fetch. */
  fetchImpl?: typeof fetch;
};

interface VkWallPostResponse {
  response?: { post_id: number };
  error?: { error_code: number; error_msg: string };
}

/**
 * wall.post — публикация текстового поста на стену. Бросает VkApiError на
 * VK-ошибке (error в теле — VK обычно отвечает HTTP 200 даже на ошибки),
 * на не-200 HTTP (edge/Qrator WAF/5xx — отдаёт HTML, а не JSON) и на
 * неожиданном ответе. `code` в VkApiError позволяет звонящему решить, ретраить ли.
 *
 * from_group=1 ставится автоматически для стен сообществ (owner_id < 0) → пост
 * от имени сообщества, а не от лица токен-владельца.
 */
export async function vkWallPost(
  message: string,
  opts: VkPostOpts,
): Promise<{ ok: true; method: "wall.post"; postId: number }> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const params = new URLSearchParams({
    owner_id: opts.ownerId,
    message,
    access_token: opts.accessToken,
    v: VK_API_VERSION,
  });
  if (opts.ownerId.startsWith("-")) params.set("from_group", "1");
  if (opts.guid) params.set("guid", opts.guid);

  const res = await fetchImpl(`${VK_API_BASE}/wall.post`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  // [4]: VK API-слой обычно отдаёт 200 даже на ошибки, НО edge (Qrator/WAF/5xx/
  // maintenance) может вернуть не-200 c HTML-телом → res.json() бросил бы
  // непрозрачный parse-error. Проверяем статус с контекстом (как telegram.ts).
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new VkApiError(0, `VK wall.post HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as VkWallPostResponse;
  if (json.error) {
    throw new VkApiError(
      json.error.error_code,
      `VK wall.post failed: [${json.error.error_code}] ${json.error.error_msg}`,
    );
  }
  if (!json.response) {
    throw new VkApiError(
      0,
      `VK wall.post: неожиданный ответ ${JSON.stringify(json).slice(0, 200)}`,
    );
  }
  return { ok: true, method: "wall.post", postId: json.response.post_id };
}
