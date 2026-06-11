import type { FeedItem } from "@/lib/feed";
import { DailyTakeCard } from "./cards/daily-take-card";
import { DeepDiveCard } from "./cards/deep-dive-card";
import { NewsCard } from "./cards/news-card";

/**
 * Router: выбирает компонент карточки по template (brief §3).
 * Для template'ов которые ещё не получили dedicated layout (guide, digest)
 * используем NewsCard как fallback.
 */
export function FeedCard({ item }: { item: FeedItem }) {
  switch (item.template) {
    case "deep-dive":
      return <DeepDiveCard item={item} />;
    case "daily-take":
      return <DailyTakeCard item={item} />;
    default:
      return <NewsCard item={item} />;
  }
}
