import { Heart, MessageCircle, Quote } from "lucide-react";
import Link from "next/link";
import type { FeedItem } from "@/lib/feed";

/**
 * DailyTakeCard — brief §3.3 (daily-take).
 * Карточка-цитата: большая аватарка автора, мнение курсивом, кнопка «обсудить».
 * Структура: автор + категория сверху, цитата по центру, реакции снизу.
 */
export function DailyTakeCard({ item }: { item: FeedItem }) {
  const authorName = item.authorName ?? "Редакция";
  const initial = authorName.charAt(0);

  return (
    <Link
      href={`/article/${item.slug}`}
      className="block overflow-hidden rounded-[20px] border border-gold/30 bg-card p-5 transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
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
            {item.category} · реакция дня
          </div>
        </div>
        {item.badge && (
          <span className="rounded bg-gold px-2 py-1 font-display text-[10px] font-extrabold uppercase tracking-[0.1em] text-steel">
            ✦ {item.badge}
          </span>
        )}
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

      <div className="mt-4 flex items-center justify-between border-t border-fence pt-3 text-[11px] text-haze">
        <span className="font-medium">{item.readMinutes} мин чтения</span>
        <div className="flex items-center gap-3.5">
          <span className="flex items-center gap-1.5">
            <Heart size={14} strokeWidth={1.75} />
            {item.reactions}
          </span>
          <span className="flex items-center gap-1.5 font-medium text-gold">
            <MessageCircle size={14} strokeWidth={1.75} />
            Обсудить в клампе
          </span>
        </div>
      </div>
    </Link>
  );
}
