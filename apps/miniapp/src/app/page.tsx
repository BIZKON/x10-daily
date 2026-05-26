import { Suspense } from "react";
import { FeedCard } from "@/components/feed-card";
import { TodayBadge } from "@/components/today-badge";
import { loadDailyFeed } from "@/lib/feed";

export default function DailyPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-[640px] px-5 pb-20 pt-8">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">X10 Daily</h1>
          <p className="mt-1 text-xs uppercase tracking-widest text-[var(--color-text-secondary)]">
            Деловое утро · 7 минут
          </p>
        </div>
        <TodayBadge />
      </header>

      <Suspense fallback={<FeedSkeleton />}>
        <DailyFeed />
      </Suspense>
    </main>
  );
}

async function DailyFeed() {
  "use cache";
  const items = await loadDailyFeed();
  return (
    <ul className="flex flex-col gap-3">
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
    <ul className="flex flex-col gap-3" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <li
          key={i}
          className="h-32 animate-pulse rounded-[var(--radius-web)] border border-[var(--color-border-dark)] bg-[#13131a]"
        />
      ))}
    </ul>
  );
}
