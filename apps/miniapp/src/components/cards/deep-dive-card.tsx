import { ArrowRight, BookOpen, Flame } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { FeedItem } from "@/lib/feed";
import { BrandedCover } from "./branded-cover";

/**
 * DeepDiveCard — brief §3.2 (deep-dive).
 * Большая hero-карточка для лонгрида: высокая обложка, бейдж «РАЗБОР»,
 * расширенный excerpt с заголовком и подзаголовком (lede как subtitle).
 */
export function DeepDiveCard({ item }: { item: FeedItem }) {
  return (
    <Link
      href={`/article/${item.slug}`}
      className="block overflow-hidden rounded-[24px] border border-fence bg-card transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      <div className="relative">
        {item.imageUrl ? (
          <>
            <Image
              src={item.imageUrl}
              alt=""
              width={1200}
              height={700}
              className="h-64 w-full object-cover"
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-t from-night via-night/60 to-transparent" />
          </>
        ) : (
          <BrandedCover category={item.categoryKey} className="h-64 w-full" />
        )}

        {item.badge && (
          <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded bg-gold px-2.5 py-1 font-display text-[10px] font-extrabold uppercase tracking-[0.1em] text-steel">
            ✦ {item.badge}
          </span>
        )}
        {item.hot && (
          <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-pill bg-red/95 px-2 py-1 text-[10px] font-bold uppercase text-white">
            <Flame size={12} strokeWidth={2} />
            HOT
          </span>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-gold/95 px-2.5 py-1 font-display text-[10px] font-extrabold uppercase tracking-[0.15em] text-steel">
              <BookOpen size={11} strokeWidth={2.25} />
              Глубокий разбор
            </span>
            <span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-gold">
              {item.category}
            </span>
          </div>
          <h3 className="m-0 font-display text-[22px] font-extrabold leading-[1.2] text-paper">
            {item.title}
          </h3>
        </div>
      </div>

      <div className="p-5">
        <p className="m-0 text-[14px] leading-[1.55] text-mist">{item.excerpt}</p>

        <div className="mt-4 flex items-center justify-between border-t border-fence pt-4 text-[12px] text-haze">
          <span className="font-medium">{item.readMinutes} мин чтения</span>
          <span className="flex items-center gap-1.5 font-medium text-gold">
            Читать разбор
            <ArrowRight size={14} strokeWidth={2} />
          </span>
        </div>
      </div>
    </Link>
  );
}
