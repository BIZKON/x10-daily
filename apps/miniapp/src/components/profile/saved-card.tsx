import type { SavedArticle } from "@/lib/profile";
import { Bookmark } from "lucide-react";
import Link from "next/link";

/**
 * Компактная карточка в списке «Сохранённое». Без реакций/статусов (это список
 * закладок, не лента) — рубрика, заголовок, лид, мета (сохранено · N мин).
 * Вся карточка = Link в читалку (интерактивных контролов внутри нет).
 */
export function SavedCard({ item }: { item: SavedArticle }) {
  return (
    <Link
      href={`/article/${item.slug}`}
      className="block rounded-2xl border border-fence bg-card p-4 transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-red">
          {item.category}
        </span>
        {item.isPremium && (
          <span className="rounded bg-gold px-1.5 py-0.5 font-display text-[9px] font-extrabold uppercase tracking-[0.1em] text-steel">
            ✦ PREMIUM
          </span>
        )}
      </div>
      <h3 className="m-0 mb-1.5 line-clamp-2 font-display text-[16px] font-extrabold leading-[1.3] text-paper">
        {item.title}
      </h3>
      <p className="m-0 mb-2.5 line-clamp-2 text-[13px] leading-[1.45] text-mist">{item.excerpt}</p>
      <div className="flex items-center gap-1.5 text-[11px] text-haze">
        <Bookmark size={13} strokeWidth={1.75} className="text-gold" fill="currentColor" />
        <span>
          {item.savedAtLabel ? `Сохранено · ${item.savedAtLabel}` : "Сохранено"} ·{" "}
          {item.readMinutes} мин
        </span>
      </div>
    </Link>
  );
}
