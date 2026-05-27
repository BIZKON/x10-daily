import { Bookmark, Flame, Heart, MessageCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { FeedItem } from "@/lib/feed";

/**
 * NewsCard — brief §3.1 (card-news).
 * Компактная карточка с обложкой, категорией и короткими meta.
 * 70% материалов в ленте — этот формат.
 */
export function NewsCard({ item }: { item: FeedItem }) {
  return (
    <Link
      href={`/article/${item.slug}`}
      className="block overflow-hidden rounded-[20px] border border-fence bg-card transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      <div className="relative">
        <Image
          src={item.imageUrl}
          alt=""
          width={800}
          height={400}
          className="h-44 w-full object-cover"
          unoptimized
        />
        <div className="absolute inset-0 bg-gradient-to-t from-night/50 to-transparent" />

        {item.badge && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded bg-gold px-2.5 py-1 font-display text-[10px] font-extrabold uppercase tracking-[0.1em] text-steel">
            ✦ {item.badge}
          </span>
        )}
        {item.hot && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-pill bg-red/95 px-2 py-1 text-[10px] font-bold uppercase text-white">
            <Flame size={12} strokeWidth={2} />
            HOT
          </span>
        )}
      </div>

      <div className="p-4">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-red">
          {item.category}
        </span>
        <h4 className="mt-1.5 mb-2 font-display text-[17px] font-extrabold leading-[1.3] text-paper">
          {item.title}
        </h4>
        <p className="m-0 text-[13.5px] leading-[1.5] text-mist">{item.excerpt}</p>

        <div className="mt-3 flex items-center justify-between border-t border-fence pt-3 text-[11px] text-haze">
          <span className="font-medium">{item.readMinutes} мин чтения</span>
          <div className="flex items-center gap-3.5">
            <span className="flex items-center gap-1.5">
              <Heart size={14} strokeWidth={1.75} />
              {item.reactions}
            </span>
            <span className="flex items-center gap-1.5">
              <MessageCircle size={14} strokeWidth={1.75} />
              {item.comments}
            </span>
            <Bookmark size={14} strokeWidth={1.75} />
          </div>
        </div>
      </div>
    </Link>
  );
}
