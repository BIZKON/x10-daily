/**
 * Клиент image-модели через Timeweb AI Gateway (Спека 2).
 *
 * Спайк (session 29) снял два блокера: Nano Banana 2 доступна прямо в шлюзе, тем
 * же ключом `AI_GATEWAY_API_KEY`, что и текстовые агенты → ни ключа Google, ни
 * зарубежного прокси. Генерация не покидает РФ-инфру (152-ФЗ чище, CLAUDE.md §7).
 *
 * ⚠️ Форма ответа НЕстандартная для OpenAI-совместимого API, поэтому здесь сырой
 * fetch, а не openai-SDK (его типы такого поля не знают):
 *   choices[0].message.images[0].image_url.url = "data:image/jpeg;base64,…"
 *   choices[0].message.content = null   ← НЕ использовать, картинки там нет
 */

/** Узкий срез env — структурно совместим с PipelineEnv, но тестируется без каста. */
export type ImageGenEnv = {
  AI_GATEWAY_BASE_URL: string;
  AI_GATEWAY_API_KEY?: string;
  IMAGE_MODEL: string;
};

/**
 * Таймаут на генерацию картинки. Шлюз Timeweb БУФЕРИЗУЕТ ответ (заголовки
 * приходят по завершении генерации — грабля session 24 в define-agent), поэтому
 * клиентский таймаут покрывает всю генерацию целиком, а не только заголовки.
 * Спайк: ~30-60 с на кадр; 300 с — запас на деградацию шлюза.
 */
const IMAGE_TIMEOUT_MS = 300_000;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Разбирает `data:<mime>;base64,<payload>` в байты.
 * Принимает только image/* — иначе на диск (и в раздачу Caddy) мог бы уехать
 * html/svg от подменённого апстрима.
 */
export function parseDataUrl(url: string): { mime: string; bytes: Uint8Array } {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  if (!m) {
    throw new Error("Ответ image-модели: ожидался data:<mime>;base64,… URL картинки.");
  }
  const mime = (m[1] ?? "").toLowerCase();
  const payload = m[2] ?? "";
  if (!ALLOWED_MIME.has(mime)) {
    throw new Error(`Ответ image-модели: неподдерживаемый тип image-данных «${mime}».`);
  }
  const bytes = new Uint8Array(Buffer.from(payload, "base64"));
  if (bytes.length === 0) {
    throw new Error("Ответ image-модели: пустое тело картинки.");
  }
  return { mime, bytes };
}

type GatewayImagePart = { image_url?: { url?: unknown } };
type GatewayChoice = { message?: { images?: unknown } };
type GatewayBody = { choices?: unknown; usage?: unknown };

/**
 * Расход на генерацию картинки. Форма снята с живого шлюза:
 *
 *   usage: {
 *     prompt_tokens: 52,
 *     completion_tokens: 1514,          ← УЖЕ включает image_tokens
 *     completion_tokens_details: { text_tokens: 394, image_tokens: 1120 }
 *   }
 *
 * `image_tokens` и `text_tokens` отдаём отдельно только для аудита в
 * `pipeline_runs.output` — в стоимость идёт `completion_tokens` целиком, иначе
 * расход посчитался бы дважды.
 */
export type ImageUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  imageTokens: number;
  textTokens: number;
};

type GatewayUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  completion_tokens_details?: { text_tokens?: number; image_tokens?: number };
  prompt_tokens_details?: { cached_tokens?: number };
};

/**
 * Разбирает usage ответа. Шлюз не обязан его присылать — тогда нули, и расход
 * просто не попадёт в $-ledger. Ронять из-за учёта уже сгенерированную картинку
 * нельзя.
 */
function extractUsage(body: unknown): ImageUsage {
  const u = (body as GatewayBody | null)?.usage as GatewayUsage | undefined;
  const details = u?.completion_tokens_details;
  return {
    inputTokens: u?.prompt_tokens ?? 0,
    outputTokens: u?.completion_tokens ?? 0,
    cachedInputTokens: u?.prompt_tokens_details?.cached_tokens ?? 0,
    imageTokens: details?.image_tokens ?? 0,
    textTokens: details?.text_tokens ?? 0,
  };
}

/**
 * Достаёт первую картинку из ответа шлюза. Все промахи схемы сводит к одной
 * внятной ошибке — вызывающий Inngest-шаг просто ретраит/падает в фолбэк.
 */
export function extractImageFromResponse(body: unknown): { mime: string; bytes: Uint8Array } {
  const choices = (body as GatewayBody | null)?.choices;
  const first = Array.isArray(choices) ? (choices[0] as GatewayChoice | undefined) : undefined;
  const images = first?.message?.images;
  const part = Array.isArray(images) ? (images[0] as GatewayImagePart | undefined) : undefined;
  const url = part?.image_url?.url;
  if (typeof url !== "string" || url.length === 0) {
    throw new Error(
      "Ответ image-модели не содержит картинки (choices[0].message.images[0].image_url.url). " +
        "⚠️ message.content у этой модели всегда null — картинку там искать бесполезно.",
    );
  }
  return parseDataUrl(url);
}

/**
 * Генерирует обложку по готовому промпту. Бросает на любой сбой — вызывающий
 * шаг (generate-cover) не выставит visualStatus в pending_review, и пост уйдёт
 * текстом (железный фолбэк Спеки 2).
 */
export async function generateCoverImage(
  env: ImageGenEnv,
  prompt: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<{ bytes: Uint8Array; mime: string; usage: ImageUsage }> {
  const apiKey = env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error("generateCoverImage: AI_GATEWAY_API_KEY не задан — генерация невозможна.");
  }
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const base = env.AI_GATEWAY_BASE_URL.replace(/\/+$/, "");
  const url = `${base}/chat/completions`;

  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // ⚠️ Ключ только здесь; в текст ошибок ниже он не попадает.
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: env.IMAGE_MODEL,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  });

  if (!res.ok) {
    // Тело апстрима обрезаем: в него шлюз иногда кладёт эхо запроса.
    const detail = await res.text().catch(() => "");
    throw new Error(
      `generateCoverImage: шлюз ответил HTTP ${res.status}. ${detail.slice(0, 300)}`.trim(),
    );
  }

  const body: unknown = await res.json();
  return { ...extractImageFromResponse(body), usage: extractUsage(body) };
}
