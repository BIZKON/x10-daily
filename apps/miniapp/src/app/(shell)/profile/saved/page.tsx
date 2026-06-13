import { SavedCard } from "@/components/profile/saved-card";
import { loadBookmarks } from "@/lib/profile";
import { Bookmark, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

/**
 * Раздел «Сохранённое» — список закладок пользователя (GET /v1/profile/bookmarks).
 * Per-user данные → PPR-дыра: connection() ВНУТРИ Suspense-компонента (не на
 * странице), как профиль/лента. Гость / API down → честная подсказка.
 */
export default function SavedPage() {
  return (
    <>
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-fence bg-night/90 px-4 py-3.5 backdrop-blur-md">
        <Link
          href="/profile"
          aria-label="Назад"
          className="-ml-2 grid h-9 w-9 place-items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <ChevronLeft size={24} strokeWidth={1.75} />
        </Link>
        <h1 className="m-0 font-display text-lg font-extrabold">Сохранённое</h1>
      </header>

      <section className="px-4 py-4">
        <Suspense fallback={<SavedSkeleton />}>
          <SavedList />
        </Suspense>
      </section>
    </>
  );
}

async function SavedList() {
  await connection();
  const { authed, items } = await loadBookmarks();

  if (!authed) {
    return (
      <EmptyState
        title="Войдите через Telegram"
        text="Сохранённые статьи появятся здесь после входа в приложение."
      />
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title="Пока ничего не сохранено"
        text="Нажмите на закладку в статье — она появится здесь."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.slug}>
          <SavedCard item={item} />
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[20px] border border-fence bg-card px-4 py-12 text-center">
      <Bookmark size={28} strokeWidth={1.5} className="mx-auto mb-3 text-haze" />
      <p className="m-0 font-display text-sm font-bold text-paper">{title}</p>
      <p className="m-0 mt-1.5 text-[13px] leading-[1.5] text-haze">{text}</p>
    </div>
  );
}

function SavedSkeleton() {
  return (
    <ul className="flex flex-col gap-3" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="h-28 animate-pulse rounded-2xl border border-fence bg-card" />
      ))}
    </ul>
  );
}
