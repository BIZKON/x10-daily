import { fetchAdminAuthors } from "@/lib/api";
import { Plus, Star } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

// Cache Components (Next 16): async fetch ДОЛЖЕН быть внутри <Suspense>.
export default function AuthorsPage() {
  return (
    <Suspense fallback={<AuthorsSkeleton />}>
      <AuthorsContent />
    </Suspense>
  );
}

function AuthorsSkeleton() {
  return <div className="h-72 animate-pulse rounded-2xl bg-card" />;
}

async function AuthorsContent() {
  const data = await fetchAdminAuthors();

  return (
    <>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="m-0 font-display text-2xl font-extrabold">Авторы</h1>
          <p className="m-0 mt-1 text-[13px] text-mist">
            Профили авторов — byline для статей. Flagship = ★ Игорь Рыбаков.
          </p>
        </div>
        <Link
          href="/authors/new"
          className="flex items-center gap-1.5 rounded-lg bg-red px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-red-deep"
        >
          <Plus size={14} strokeWidth={2} /> Создать
        </Link>
      </header>

      {!data ? (
        <ApiUnavailable />
      ) : data.items.length === 0 ? (
        <EmptyState message="Ещё нет авторов. Создай первого." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.items.map((a) => (
            <Link
              key={a.id}
              href={`/authors/${a.slug}`}
              className="rounded-xl border border-fence bg-card p-4 transition hover:border-gold/40"
            >
              <div className="flex items-start gap-3">
                <span
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full font-display text-base font-extrabold text-night"
                  style={{
                    background:
                      a.bylineColor ??
                      "linear-gradient(135deg, var(--color-red), var(--color-gold))",
                  }}
                >
                  {a.name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="m-0 truncate font-display text-[15px] font-extrabold">
                      {a.name}
                    </h3>
                    {a.isFlagship && <Star size={12} fill="currentColor" className="text-gold" />}
                  </div>
                  <p className="m-0 mt-0.5 text-[12px] text-haze">{a.role}</p>
                  <p className="m-0 mt-2 line-clamp-2 text-[12.5px] text-mist">
                    {a.bio || "Без bio"}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-fence pt-3 text-[11px] text-haze">
                <span>
                  {a.isStaff ? "Сотрудник" : "Гость"} · {a.subscriberCount} подписчиков
                </span>
                <span className="font-mono text-gold">/{a.slug}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function ApiUnavailable() {
  return (
    <div className="rounded-xl border border-red/40 bg-red/[0.04] p-5 text-[13px]">
      <strong className="text-red">apps/api недоступен.</strong> Задай{" "}
      <code className="font-mono text-mist">X10_API_BASE_URL</code> в{" "}
      <code className="font-mono text-mist">apps/admin/.env.local</code>.
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-fence bg-card p-8 text-center text-[13px] text-mist">
      {message}
    </div>
  );
}
