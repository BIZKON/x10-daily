/**
 * Нормализация переносов строк в тексте от LLM (session 20 fix).
 *
 * Баг: модель (через Timeweb AI Gateway, OpenAI→Anthropic tool-перевод) иногда
 * кладёт в строковое поле ЛИТЕРАЛЬНУЮ последовательность "\n" (два символа:
 * бэкслеш + n) вместо настоящего перевода строки. В Telegram это печатается как
 * «\n» и пост слипается в один кусок. Иногда та же модель отдаёт настоящий
 * перенос → «то нормально, то сплошняком». Промпты поправлены (не просить «\n»),
 * но это второй, гарантирующий слой: на выходе всегда настоящие переносы.
 *
 * Идемпотентна: повторный прогон уже чистого текста ничего не меняет.
 */
export function normalizeNewlines(text: string): string {
  return text
    .replace(/\r\n?/g, "\n") // реальные CRLF/CR → LF
    .replace(/\\r\\n/g, "\n") // литеральный "\r\n"
    .replace(/\\n/g, "\n") // литеральный "\n"
    .replace(/\\r/g, "\n") // литеральный "\r"
    .replace(/\\t/g, " ") // литеральный "\t" → пробел
    .replace(/[ \t]+\n/g, "\n") // хвостовые пробелы перед переносом
    .replace(/\n{3,}/g, "\n\n") // 3+ переносов → максимум один пустой абзац
    .trim();
}

/**
 * Английские структурные ЛЕЙБЛЫ, которые модель печатает как заголовки секций
 * в русском посте (session 20 fix #2). Это невидимая внутренняя структура — в
 * опубликованном тексте её быть не должно. Два источника:
 *  - стадии framework (social-amplify): BAB Before/After/Bridge, PAS, AIDA, STAR, SLAY;
 *  - блоки Smart Brevity (voice.md): "Yes, but", "What's next", "Why it matters" и т.п.
 * Промпт просит не печатать их, но это гарантирующий слой.
 */
const STRUCTURAL_LABELS = [
  // framework stages
  "before",
  "after",
  "bridge",
  "problem",
  "agitation",
  "solution",
  "attention",
  "interest",
  "desire",
  "action",
  "situation",
  "task",
  "result",
  "story",
  "lesson",
  "actionable advice",
  "you",
  // Smart Brevity (Axios) блоки
  "yes, but",
  "yes but",
  "bottom line",
  "the bottom line",
  "what's next",
  "whats next",
  "what is next",
  "why it matters",
  "the big picture",
  "big picture",
  "by the numbers",
  "between the lines",
  "go deeper",
  "what they're saying",
  "what they are saying",
  "teaser",
  "lede",
];

/**
 * Срезает английские структурные лейблы в НАЧАЛЕ строк — и инлайн
 * («Before. Текст» → «Текст»), и отдельной строкой («Before.» → пусто).
 * Только bounded-набор английских терминов → русский контент не трогает
 * (английское слово + точка в начале строки в русском посте = именно артефакт).
 */
export function stripStructuralLabels(text: string): string {
  const group = [...STRUCTURAL_LABELS]
    .sort((a, b) => b.length - a.length)
    .map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  // лейбл занимает всю строку (только пунктуация после) → убрать строку целиком
  const wholeLine = new RegExp(`^[ \\t]*(?:${group})[ \\t]*[.:)\\u2014-]*[ \\t]*$`, "gim");
  // лейбл + пунктуация + пробел + контент → убрать только лейбл
  const inline = new RegExp(`^[ \\t]*(?:${group})[ \\t]*[.:)\\u2014-]+[ \\t]+`, "gim");
  // Цикл до фикс-точки (audit L13): «Before. After. Текст» одним проходом оставил
  // бы второй лейбл. Идемпотентность важна и для L14 (re-clean в post-to-tg не
  // должен расходиться с сохранённым в channels.text).
  let prev: string;
  let out = text;
  do {
    prev = out;
    out = out.replace(wholeLine, "").replace(inline, "");
  } while (out !== prev);
  return out;
}

/**
 * Полная очистка текста поста перед публикацией: настоящие переносы строк +
 * срез английских структурных лейблов + повторная нормализация (схлопнуть
 * пустые строки после удаления лейблов-строк). Идемпотентна.
 */
export function cleanPostText(text: string): string {
  return normalizeNewlines(stripStructuralLabels(normalizeNewlines(text)));
}
