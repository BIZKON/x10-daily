import { deriveCardStatus } from "@/lib/card-status";
import type { FeedItem } from "@/lib/feed";
import { formatPublishedAt } from "@/lib/format";
import { MessageCircle, Quote } from "lucide-react";
import Link from "next/link";
import { CardReactions } from "./card-reactions";
import { StatusBadge } from "./status-badge";

/**
 * DailyTakeCard — brief §3.3 (daily-take).
 * Карточка-цитата: большая аватарка автора, мнение курсивом, реакции снизу.
 *
 * «Stretched link» (см. NewsCard): absolute <Link> z-[1] делает всю карточку
 * кликабельной; CardReactions (z-[2]) — сиблинг, тап по нему не навигирует.
 */
export function DailyTakeCard({ item }: { item: FeedItem }) {
  const authorName = item.authorName ?? "Редакция";
  const initial = authorName.charAt(0);
  const dateLabel = formatPublishedAt(item.publishedAt);
  const status = deriveCardStatus(item);

  return (
    <article className="relative rounded-[20px] border border-gold/30 bg-card p-5 transition-transform active:scale-[0.99]">
      <Link
        href={`/article/${item.slug}`}
        aria-label={item.title}
        className="absolute inset-0 z-[1] rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      />

      {(status || item.badge) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={status} />
          {item.badge && (
            <span className="rounded bg-gold px-2 py-1 font-display text-[10px] font-extrabold uppercase tracking-[0.1em] text-steel">
              ✦ {item.badge}
            </span>
          )}
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <span
          className="grid h-11 w-11 place-items-center rounded-full font-display text-base font-extrabold text-night"
          style={{ background: "linear-gradient(135deg, var(--color-red), var(--color-gold))" }}
        >
          {initial}
        </span>
        <div className="flex-1">
          <div className="font-display text-[13px] font-extrabold text-paper">{authorName}</div>
          <div className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-gold">
            {item.category} · разбор
          </div>
        </div>
      </div>

      <div className="relative pl-6">
        <Quote
          size={20}
          strokeWidth={1.5}
          className="absolute left-0 top-0 text-gold/70"
          aria-hidden
        />
        <h4 className="m-0 font-display text-[19px] font-extrabold leading-[1.25] text-paper">
          {item.title}
        </h4>
        <p className="mt-2.5 mb-0 font-display text-[15px] italic leading-[1.45] text-mist">
          {item.excerpt}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-fence pt-3 text-[11px] text-haze">
        <span className="font-medium">
          {dateLabel ? `${dateLabel} · ${item.readMinutes} мин` : `${item.readMinutes} мин чтения`}
        </span>
        <div className="flex items-center gap-3">
          <CardReactions articleId={item.id} initialCounts={item.reactionBreakdown} />
          <span className="flex shrink-0 items-center gap-1.5 font-medium text-gold">
            <MessageCircle size={14} strokeWidth={1.75} />
            Обсудить
          </span>
        </div>
      </div>
    </article>
  );
}
