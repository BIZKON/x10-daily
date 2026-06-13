/**
 * Статус поста для пилюли-бейджа (П3 — «статусы надо указывать»):
 * Срочно / Горячая / Важная. Выводится из сигналов, которые УЖЕ есть
 * (свежесть, реакции, isFeatured) — без новых полей в БД и без выдуманных
 * данных. Это UI-эвристика (как «hot/rising» в новостных лентах), не
 * фабрикованный контент.
 *
 * ⚠️ Считается на РЕНДЕРЕ карточки (динамическая PPR-дыра DailyFeed), не в
 * кэшируемой data-функции — поэтому свежесть актуальна на каждый запрос.
 *
 * Лестница (сверху вниз — первый сработавший):
 *   Срочно  — <3 ч с публикации (только что, breaking)
 *   Горячая — Σреакций ≥ 50 (реально трендит)
 *   Важная  — isFeatured (редакция/пайплайн выделили)
 *   Горячая — <24 ч (сегодняшняя повестка)
 *   Важная  — <72 ч (повестка недели)
 *   нет     — старше, без сигналов
 *
 * Пороги — продуктовые, легко тюнить (по просьбе Константина).
 */
export type CardStatus = "urgent" | "hot" | "important";

const HOUR_MS = 60 * 60 * 1000;
/** Минимум реакций, чтобы считать пост «Горячим» по engagement. */
const HOT_REACTIONS = 50;

export function deriveCardStatus(
  item: { publishedAt: string | null; reactions: number; hot: boolean },
  nowMs: number = Date.now(),
): CardStatus | null {
  const ts = item.publishedAt ? new Date(item.publishedAt).getTime() : Number.NaN;
  const ageH = Number.isNaN(ts) ? Number.POSITIVE_INFINITY : (nowMs - ts) / HOUR_MS;

  // Будущая дата (scheduled-материал / рассинхрон часов) → не «Срочно».
  if (ageH < 0) return item.hot ? "important" : null;
  if (ageH < 3) return "urgent";
  if (item.reactions >= HOT_REACTIONS) return "hot";
  if (item.hot) return "important"; // FeedItem.hot = articles.isFeatured
  if (ageH < 24) return "hot";
  if (ageH < 72) return "important";
  return null;
}
