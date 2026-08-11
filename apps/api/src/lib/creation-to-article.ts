import { slugify } from "@x10/config";
import type { ArticleBlock } from "@x10/db";

/**
 * Готовое задание ручного режима → статья.
 *
 * Ручной режим отдаёт плоский текст: заголовок и материал. Статья устроена
 * иначе — тизер, вводка и блоки Smart Brevity. Стык между этими двумя формами
 * и есть единственное место, где материал может потерять форму, поэтому он
 * живёт отдельной чистой функцией, а не внутри маршрута.
 *
 * Разметку из текста НЕ угадываем. Соблазн распознать «Почему это важно» и
 * собрать из него callout велик, но угадывание ошибается молча: не угадали —
 * блок уехал в обычный абзац, угадали неверно — в выноску попало полматериала.
 * Пока режим отдаёт плоский текст, честнее плоский результат; появится
 * структурированный вывод агента — появится и структура здесь.
 */

export type ArticleDraft = {
  slug: string;
  tease: string;
  lede: string;
  body: ArticleBlock[];
  wordCount: number;
  readSeconds: number;
};

/** Абзацы: разделитель — пустая строка. Пробельные куски выбрасываем. */
function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function toArticleDraft(result: { title: string; body: string }): ArticleDraft {
  const parts = paragraphs(result.body);
  const lede = parts[0] ?? result.title;
  const rest = parts.slice(1);

  const wordCount = [lede, ...rest].join(" ").split(/\s+/).filter(Boolean).length;

  return {
    // Пустой slug сделал бы статью недоступной по ссылке, поэтому запасной
    // вариант обязателен: заголовок мог состоять из одних символов.
    slug: slugify(result.title) || `material-${wordCount}`,
    tease: result.title,
    lede,
    body: rest.map((text) => ({ type: "paragraph", text })),
    wordCount,
    // 200 слов в минуту — та же оценка, что у конвейера. Нижняя граница нужна,
    // чтобы в карточке не появилось «0 секунд»: это читается как поломка.
    readSeconds: Math.max(20, Math.round((wordCount / 200) * 60)),
  };
}
