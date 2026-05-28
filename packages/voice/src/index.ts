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

/** Чёрный список ~30 слов из ToV Guidelines v1.0 — никогда не используем. */
export const BLACKLIST: readonly string[] = [
  "соборное мышление",
  "архитектор возможностей",
  "преображать мир",
  "миллион сердец",
  "созидательная энергия",
  "проявленность",
  "истинный путь",
  "коллективная воля",
  "потрясающий",
  "революционный",
  "беспрецедентный",
  "гениально",
  "феноменально",
  "легенда",
  "настоящий прорыв",
  "трансформация сознания",
  "квантовый скачок",
  "энергия успеха",
  "лидерство будущего",
  "новая парадигма",
  "пробуждение",
  "осознанность бизнеса",
  "духовный капитал",
  "вибрации денег",
  "успешные люди",
  "правильно делать",
  "вам стоит",
  "надо понимать",
  "позитивное мышление",
  "богатый мышление",
] as const;

/**
 * Author-specific voice (если статья от имени конкретного спикера —
 * не обезличенной редакции). Файлы лежат в packages/voice/about-author-{name}.md.
 * На M0 — заглушка, возвращаем null. После Layer 5 заполним.
 */
export function loadAuthorVoice(name: string): string | null {
  try {
    return read(`about-author-${name}.md`);
  } catch {
    return null;
  }
}
