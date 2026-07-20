import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function read(filename: string): string {
  return readFileSync(join(root, filename), "utf8");
}

/** voice.md — operational rules for AI-агентов (см. CLAUDE.md §6). */
export const VOICE_RULES: string = read("voice.md");

/** about-me.md — кто мы как редакция, для system-prompt инжекции. */
export const ABOUT_ME: string = read("about-me.md");

/**
 * visual.md — operational rules для VisualAgent (NB2) и шаблонизатора карточек.
 * Брат voice.md. Прямая инжекция в system-prompt VisualAgent + чтение шаблонизатором
 * карточек для палитры/типографики/whitelist/off-limits.
 */
export const VISUAL_RULES: string = read("visual.md");

/**
 * Чёрный список ~30 слов — никогда не используем (voice.md §Off-limits).
 * Две группы: универсальный анти-инфобиз + анти-ИИ-хайп (канон ProAgent AI).
 */
export const BLACKLIST: readonly string[] = [
  // Анти-инфобиз (универсальная часть)
  "потрясающий",
  "революционный",
  "беспрецедентный",
  "гениально",
  "феноменально",
  "легенда",
  "настоящий прорыв",
  "квантовый скачок",
  "новая парадигма",
  "успешные люди",
  "секреты успеха",
  "марафон успеха",
  "взрывной рост",
  "денежное мышление",
  "позитивное мышление",
  "личностный рост",
  "правильно делать",
  "вам стоит",
  "надо понимать",
  "работающие методы",
  // Анти-ИИ-хайп (пустые обещания без цифр)
  "революционный ИИ",
  "магия нейросетей",
  "магия ИИ",
  "ИИ заменит всех",
  "уникальная нейросеть",
  "нейросеть решит всё",
  "ИИ-революция",
  "безграничные возможности",
  "умнее человека",
  "будущее уже здесь",
  "останетесь за бортом",
  "в эпоху ИИ",
] as const;

/**
 * Author-specific voice (если статья от имени конкретного спикера —
 * не обезличенной редакции). Файлы лежат в packages/voice/about-author-{name}.md.
 * Сейчас есть about-author-founder.md — голос основателя ProAgent AI
 * (ручные кейсы + «Разбор от основателя»). Нет файла → null (голос редакции).
 */
export function loadAuthorVoice(name: string): string | null {
  try {
    return read(`about-author-${name}.md`);
  } catch {
    return null;
  }
}
