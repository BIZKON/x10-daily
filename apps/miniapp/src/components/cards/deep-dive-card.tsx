import { deriveCardStatus } from "@/lib/card-status";
import type { FeedItem } from "@/lib/feed";
import { formatPublishedAt } from "@/lib/format";
import { ArrowRight, BookOpen } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { BrandedCover } from "./branded-cover";
import { CardReactions } from "./card-reactions";
import { StatusBadge } from "./status-badge";

/**
 * DeepDiveCard — brief §3.2 (deep-dive). Большая карточка лонгрида.
 *
 * П3: без реального фото обложка — content-driven текстовый блок на градиенте
 * (бейджи + заголовок с симметричными отступами), а НЕ высокая пустая обложка с
 * заголовком, висящим внизу. Так «воздух» сверху убран, превью цельное.
 * С реальным фото (редко) — прежний оверлей поверх снимка.
 *
 * «Stretched link» (см. NewsCard): absolute <Link> z-[1] + CardReactions z-[2].
 */
export function DeepDiveCard({ item }: { item: FeedItem }) {
  const dateLabel = formatPublishedAt(item.publishedAt);
  const status = deriveCardStatus(item);

  const badges = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-pill bg-gold/95 px-2.5 py-1 font-display text-[10px] font-extrabold uppercase tracking-[0.15em] text-steel">
        <BookOpen size={11} strokeWidth={2.25} />
        Глубокий разбор
      </span>
      <span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-gold">
        {item.category}
      </span>
      <StatusBadge status={status} />
      {item.badge && (
        <span className="rounded bg-gold px-2 py-1 font-display text-[10px] font-extrabold uppercase tracking-[0.1em] text-steel">
          ✦ {item.badge}
        </span>
      )}
    </div>
  );

  const title = (
    <h3 className="m-0 line-clamp-3 font-display text-[22px] font-extrabold leading-[1.2] text-paper">
      {item.title}
    </h3>
  );

  return (
    <article className="relative rounded-[24px] border border-fence bg-card transition-transform active:scale-[0.99]">
      <Link
        href={`/article/${item.slug}`}
        aria-label={item.title}
        className="absolute inset-0 z-[1] rounded-[24px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      />

      {item.imageUrl ? (
        <div className="relative overflow-hidden rounded-t-[24px]">
          <Image
            src={item.imageUrl}
            alt=""
            width={1200}
            height={700}
            className="h-64 w-full object-cover"
            unoptimized
          />
          <div className="absolute inset-0 bg-gradient-to-t from-night via-night/60 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <div className="mb-2.5">{badges}</div>
            {title}
          </div>
        </div>
      ) : (
        <BrandedCover category={item.categoryKey} className="rounded-t-[24px] px-5 pb-6 pt-6">
          <div className="mb-3">{badges}</div>
          {title}
        </BrandedCover>
      )}

      <div className="p-5">
        <p className="m-0 text-[14px] leading-[1.55] text-mist">{item.excerpt}</p>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-fence pt-4 text-[12px] text-haze">
          <span className="font-medium">
            {dateLabel
              ? `${dateLabel} · ${item.readMinutes} мин`
              : `${item.readMinutes} мин чтения`}
          </span>
          <div className="flex items-center gap-3">
            <CardReactions articleId={item.id} initialCounts={item.reactionBreakdown} />
            <span className="flex shrink-0 items-center gap-1.5 font-medium text-gold">
              Читать разбор
              <ArrowRight size={14} strokeWidth={2} />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
