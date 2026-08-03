import type { FeedItem } from "@/lib/feed";
import { DailyTakeCard } from "./cards/daily-take-card";
import { DeepDiveCard } from "./cards/deep-dive-card";
import { NewsCard } from "./cards/news-card";

/**
 * Router: выбирает компонент карточки по template (brief §3).
 * Для template'ов которые ещё не получили dedicated layout (guide, digest)
 * используем NewsCard как fallback.
 *
 * `priority` — только для ПЕРВОЙ карточки экрана: её обложка обычно и есть
 * LCP-элемент (бюджет §2: LCP ≤ 2.5 с), остальные грузятся лениво.
 * DailyTakeCard обложку не рендерит — ему флаг не нужен.
 */
export function FeedCard({ item, priority }: { item: FeedItem; priority?: boolean }) {
  switch (item.template) {
    case "deep-dive":
      return <DeepDiveCard item={item} priority={priority} />;
    case "daily-take":
      return <DailyTakeCard item={item} />;
    case "card-news":
    case "guide":
    case "digest":
    default:
      return <NewsCard item={item} priority={priority} />;
  }
}
