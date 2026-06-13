import { connection } from "next/server";
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
      <Suspense fallback={<HeroSkeleton />}>
        <HeroDigest />
      </Suspense>
      <section className="px-4">
        <div className="mb-3.5 flex items-center justify-between">
          <h3 className="m-0 font-display text-xl font-extrabold">Лента дня</h3>
          <span className="text-[11px] font-semibold text-haze">обновляется в течение дня</span>
        </div>
        <Suspense fallback={<FeedSkeleton />}>
          <DailyFeed />
        </Suspense>
      </section>
    </>
  );
}

function HeroSkeleton() {
  return (
    <div
      aria-busy="true"
      className="mx-4 mb-5 h-[260px] animate-pulse rounded-[20px] bg-red/20"
    />
  );
}

async function DailyFeed() {
  // Динамическая дыра PPR (как HeroDigest): connection() внутри Suspense →
  // лента НЕ запекается в статику build-time мок-fallback'ом (слаги, которых
  // нет в БД → 404), а тянется из живого API в рантайме. Кэш 15м — на
  // loadDailyFeed («use cache»).
  await connection();
  const items = await loadDailyFeed();
  if (items.length === 0) {
    return (
      <div className="rounded-[20px] border border-fence bg-card px-4 py-12 text-center">
        <p className="m-0 font-display text-sm font-bold text-paper">Лента обновляется</p>
        <p className="m-0 mt-1.5 text-[13px] leading-[1.5] text-haze">
          Свежие материалы появятся совсем скоро — загляните чуть позже.
        </p>
      </div>
    );
  }
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
