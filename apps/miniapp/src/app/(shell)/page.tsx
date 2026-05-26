import { Suspense } from "react";
import { CategoryChips } from "@/components/category-chips";
import { FeedCard } from "@/components/feed-card";
import { HeroDigest } from "@/components/hero-digest";
import { TopBar } from "@/components/top-bar";
import { HOME_CATEGORIES, loadDailyFeed } from "@/lib/feed";

export default function HomePage() {
  return (
    <>
      <TopBar title="Х10 Новости" />
      <CategoryChips items={HOME_CATEGORIES} />
      <HeroDigest />
      <section className="px-4">
        <div className="mb-3.5 flex items-center justify-between">
          <h3 className="m-0 font-display text-xl font-extrabold">Лента дня</h3>
          <span className="text-[11px] font-semibold text-haze">обновлено 2 мин назад</span>
        </div>
        <Suspense fallback={<FeedSkeleton />}>
          <DailyFeed />
        </Suspense>
      </section>
    </>
  );
}

async function DailyFeed() {
  "use cache";
  const items = await loadDailyFeed();
  return (
    <ul className="flex flex-col gap-3.5">
      {items.map((item) => (
        <li key={item.id}>
          <FeedCard item={item} />
        </li>
      ))}
    </ul>
  );
}

function FeedSkeleton() {
  return (
    <ul className="flex flex-col gap-3.5" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <li
          key={i}
          className="h-72 animate-pulse rounded-[20px] border border-fence bg-card"
        />
      ))}
    </ul>
  );
}
