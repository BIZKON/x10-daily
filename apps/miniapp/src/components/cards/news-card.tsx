import { deriveCardStatus } from "@/lib/card-status";
import type { FeedItem } from "@/lib/feed";
import { formatPublishedAt } from "@/lib/format";
import Image from "next/image";
import Link from "next/link";
import { BrandedCover } from "./branded-cover";
import { CardReactions } from "./card-reactions";
import { StatusBadge } from "./status-badge";

/**
 * NewsCard — brief §3.1 (card-news). 70% материалов в ленте.
 *
 * П3: text-only. Без реального фото — НЕ крупная пустая обложка с иконкой, а
 * слим-градиент-хедер с золотой пилюлей рубрики + статусом (Срочно/Горячая/
 * Важная). Заголовок сразу под хедером — цельно, без «воздуха».
 *
 * «Stretched link»: вся карточка кликабельна через absolute <Link> (z-[1]);
 * CardReactions (z-[2]) — сиблинг, тап по нему не навигирует. Корень БЕЗ
 * overflow-hidden (иначе клипается popover) — обрезку даёт обёртка хедера.
 */
export function NewsCard({ item }: { item: FeedItem }) {
  const dateLabel = formatPublishedAt(item.publishedAt);
  const status = deriveCardStatus(item);

  const rubricRow = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center rounded-pill bg-gold/95 px-2.5 py-1 font-display text-[10px] font-extrabold uppercase tracking-[0.15em] text-steel">
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

  return (
    <article className="relative rounded-[20px] border border-fence bg-card transition-transform active:scale-[0.99]">
      <Link
        href={`/article/${item.slug}`}
        aria-label={item.title}
        className="absolute inset-0 z-[1] rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      />

      {item.imageUrl ? (
        <div className="relative overflow-hidden rounded-t-[20px]">
          <Image
            src={item.imageUrl}
            alt=""
            width={800}
            height={400}
            className="h-44 w-full object-cover"
            unoptimized
          />
          <div className="absolute inset-0 bg-gradient-to-t from-night/80 via-night/30 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-4">{rubricRow}</div>
        </div>
      ) : (
        <BrandedCover category={item.categoryKey} className="rounded-t-[20px] px-4 pb-3.5 pt-4">
          {rubricRow}
        </BrandedCover>
      )}

      <div className="px-4 pb-4 pt-3.5">
        <h4 className="m-0 mb-2 line-clamp-3 font-display text-[17px] font-extrabold leading-[1.3] text-paper">
          {item.title}
        </h4>
        <p className="m-0 text-[13.5px] leading-[1.5] text-mist">{item.excerpt}</p>

        <div className="mt-3 flex items-center justify-between border-t border-fence pt-3 text-[11px] text-haze">
          <span className="font-medium">
            {dateLabel
              ? `${dateLabel} · ${item.readMinutes} мин`
              : `${item.readMinutes} мин чтения`}
          </span>
          <CardReactions articleId={item.id} initialCounts={item.reactionBreakdown} />
        </div>
      </div>
    </article>
  );
}
