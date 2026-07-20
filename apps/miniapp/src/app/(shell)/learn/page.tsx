import { FeedCard } from "@/components/feed-card";
import { TopBar } from "@/components/top-bar";
import { loadCategoryFeed } from "@/lib/feed";
import { connection } from "next/server";
import { Suspense } from "react";

export default function LearnPage() {
  return (
    <>
      <TopBar title="Обучение" />

      <section className="relative overflow-hidden border-b border-fence px-5 pb-7 pt-5 [background:linear-gradient(135deg,#1A0B0C_0%,var(--color-night)_60%)]">
        <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-red/[0.06]" />
        <span className="relative text-[10px] font-extrabold uppercase tracking-[0.15em] text-red">
          Рубрика
        </span>
        <h1 className="relative m-0 mt-1.5 font-display text-[34px] font-extrabold leading-[1.1]">
          Обучение и методики
        </h1>
        <p className="relative m-0 mt-2 text-[13.5px] leading-[1.5] text-mist">
          Пошаговые инструкции: как выбрать задачу для ИИ-агента, составить ТЗ и посчитать выгоду до
          внедрения.
        </p>
      </section>

      <section className="px-4 py-5">
        <Suspense fallback={<FeedSkeleton />}>
          <LearnFeed />
        </Suspense>
      </section>
    </>
  );
}

/**
 * Реальная лента рубрики «Обучение» (статьи category=howto из API). PPR-дыра:
 * connection() внутри Suspense → build не запекает fallback, данные из живого
 * API в рантайме (кэш на loadCategoryFeed). Тот же паттерн, что лента/hero.
 */
async function LearnFeed() {
  await connection();
  const items = await loadCategoryFeed("howto");

  if (items.length === 0) {
    return (
      <div className="rounded-[20px] border border-fence bg-card px-4 py-12 text-center">
        <p className="m-0 font-display text-sm font-bold text-paper">Материалы готовятся</p>
        <p className="m-0 mt-1.5 text-[13px] leading-[1.5] text-haze">
          Свежие методики и инструкции появятся здесь.
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

const SKELETON_SLOTS = ["s1", "s2", "s3", "s4"] as const;

function FeedSkeleton() {
  return (
    <ul className="flex flex-col gap-3.5" aria-busy="true">
      {SKELETON_SLOTS.map((slot) => (
        <li key={slot} className="h-72 animate-pulse rounded-[20px] border border-fence bg-card" />
      ))}
    </ul>
  );
}
