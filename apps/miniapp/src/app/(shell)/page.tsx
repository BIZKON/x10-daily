import { CategoryChips } from "@/components/category-chips";
import { FeedCard } from "@/components/feed-card";
import { HeroDigest } from "@/components/hero-digest";
import { PartnerInvite } from "@/components/partner-invite";
import { StoriesBar, StoriesCaption } from "@/components/stories-bar";
import { TopBar } from "@/components/top-bar";
import { fetchPartnerProgram } from "@/lib/api";
import { HOME_CATEGORIES, loadDailyFeed } from "@/lib/feed";
import { connection } from "next/server";
import { Suspense } from "react";

export default function HomePage() {
  return (
    <>
      <TopBar title="ProAgent AI" />
      {/* Полоса кружков сразу под шапкой: это витрина программы и продукта, а
          не раздел ленты. Своей дырой — ждать её ради статей незачем. */}
      <Suspense fallback={<StoriesSkeleton />}>
        <Stories />
      </Suspense>
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

/**
 * Кружки решают, что показать, по одному признаку: партнёр человек или нет.
 *
 * 🔴 `connection()` внутри дыры (CLAUDE.md §8): без него на билде запросы не
 * тронут cookies, и полоса запечётся в статику в состоянии «не партнёр» —
 * навсегда, для всех.
 */
async function Stories() {
  await connection();
  const info = await fetchPartnerProgram();
  // Программа выключена в этой копии (или api молчит) — полосу не показываем:
  // у клиента завода нашей партнёрки быть не должно.
  if (!info) return null;

  return (
    <>
      <StoriesBar isPartner={info.isPartner} />
      <StoriesCaption isPartner={info.isPartner} />
    </>
  );
}

function StoriesSkeleton() {
  return (
    <div className="flex gap-3.5 px-4 pt-3 pb-1">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[68px] w-[68px] shrink-0 animate-pulse rounded-full bg-card" />
      ))}
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div aria-busy="true" className="mx-4 mb-5 h-[260px] animate-pulse rounded-[20px] bg-red/20" />
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
      {items.map((item, i) => (
        <li key={item.id}>
          {/* Первая карточка — LCP-элемент экрана: грузим её обложку с приоритетом. */}
          <FeedCard item={item} priority={i === 0} />
          {/* Приглашение — после третьей карточки: выше оно спорит с главным
              материалом дня, ниже его просто не долистают. Компонент сам решит,
              показываться ли: у клиента завода и у действующего партнёра он
              возвращает null. */}
          {i === 2 && (
            <div className="mt-3.5">
              <PartnerInvite variant="feed" />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function FeedSkeleton() {
  return (
    <ul className="flex flex-col gap-3.5" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="h-72 animate-pulse rounded-[20px] border border-fence bg-card" />
      ))}
    </ul>
  );
}
