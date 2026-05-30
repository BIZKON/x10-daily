import { X } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import {
  fetchQueue,
  type AdminCategory,
  type AdminTemplate,
  type QueueItem,
} from "@/lib/api";

/** brief §5 — user-facing категории. */
const CATEGORY_LABELS: Record<AdminCategory, string> = {
  taxes: "Налоги",
  money: "Деньги",
  practice: "Практика",
  power: "Власть",
  tech: "Технологии",
  rybakov: "Рыбаков",
};

const CATEGORY_KEYS: ReadonlySet<AdminCategory> = new Set([
  "taxes",
  "money",
  "practice",
  "power",
  "tech",
  "rybakov",
]);

/** brief §3 — шаблоны. */
const TEMPLATE_LABELS: Record<AdminTemplate, string> = {
  "card-news": "card-news",
  "deep-dive": "deep-dive",
  "daily-take": "daily-take",
  guide: "guide",
  digest: "digest",
};

function parseCategory(raw: string | string[] | undefined): AdminCategory | undefined {
  if (typeof raw !== "string") return undefined;
  return CATEGORY_KEYS.has(raw as AdminCategory) ? (raw as AdminCategory) : undefined;
}

function parseSubcategory(raw: string | string[] | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim();
  if (!v || v.length > 64) return undefined;
  return v;
}

// Cache Components (Next 16): async (searchParams + fetch) ДОЛЖНО быть внутри
// <Suspense>. Иначе build падает «Uncached data accessed outside of Suspense».
export default function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string | string[]; subcategory?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<QueueSkeleton />}>
      <QueueContent searchParams={searchParams} />
    </Suspense>
  );
}

function QueueSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-12 animate-pulse rounded-xl bg-card" />
      <div className="h-72 animate-pulse rounded-2xl bg-card" />
    </div>
  );
}

async function QueueContent({
  searchParams,
}: {
  searchParams: Promise<{ category?: string | string[]; subcategory?: string | string[] }>;
}) {
  const sp = await searchParams;
  const category = parseCategory(sp.category);
  const subcategory = parseSubcategory(sp.subcategory);
  const queue = await fetchQueue(50, { category, subcategory });
  const filtered = Boolean(category || subcategory);

  return (
    <>
      <header className="mb-6 flex items-end justify-between border-b border-fence pb-5">
        <div>
          <h1 className="m-0 font-display text-2xl font-extrabold">Очередь к публикации</h1>
          <p className="mt-1.5 text-[13px] text-mist">
            Статьи из pipeline со статусом <code className="font-mono text-gold">ready</code> ждут
            ревью редколлегии.
          </p>
        </div>
        {queue && (
          <span className="rounded-pill border border-fence bg-card px-3 py-1.5 font-mono text-[12px] text-mist">
            {queue.count} {filtered ? "отфильтровано" : "в очереди"}
          </span>
        )}
      </header>

      {filtered && (
        <ActiveFilter
          category={category}
          subcategory={subcategory}
        />
      )}

      {!queue ? (
        <ApiUnreachable />
      ) : queue.count === 0 ? (
        <EmptyQueue filtered={filtered} />
      ) : (
        <QueueList items={queue.items} />
      )}
    </>
  );
}

/**
 * Чип активного фильтра с кнопкой «Сбросить» (Link к /).
 * Показываем category-label и/или subcategory-slug в виде кода.
 */
function ActiveFilter({
  category,
  subcategory,
}: {
  category: AdminCategory | undefined;
  subcategory: string | undefined;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-gold/40 bg-gold/[0.06] px-4 py-2.5 text-[13px]">
      <span className="font-bold text-mist">Фильтр:</span>
      {category && (
        <span className="rounded-pill border border-red/40 bg-red/[0.08] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-red">
          {CATEGORY_LABELS[category]}
        </span>
      )}
      {subcategory && (
        <code className="rounded-pill border border-fence bg-night px-2.5 py-0.5 font-mono text-[11px] text-haze">
          {subcategory}
        </code>
      )}
      <Link
        href="/"
        className="ml-auto inline-flex items-center gap-1 rounded-pill border border-fence bg-card px-2.5 py-1 text-[11px] font-semibold text-paper transition-colors hover:border-red/60 hover:text-red"
      >
        <X size={11} strokeWidth={2.5} /> Сбросить
      </Link>
    </div>
  );
}

function ApiUnreachable() {
  return (
    <div className="rounded-2xl border border-red/40 bg-red/5 p-6">
      <h2 className="m-0 font-display text-lg font-extrabold text-red">apps/api недоступен</h2>
      <p className="mt-2 text-[14px] text-mist">
        Не задан <code className="font-mono text-paper">X10_API_BASE_URL</code> или worker не
        отвечает. Проверь:
      </p>
      <ol className="ml-5 mt-3 list-decimal text-[13px] text-mist">
        <li className="mb-1">
          В <code className="font-mono text-paper">apps/admin/.env.local</code> задана переменная
          <br />
          <code className="font-mono text-paper">X10_API_BASE_URL=http://localhost:8788</code>
        </li>
        <li className="mb-1">
          Запущен api worker:
          <br />
          <code className="font-mono text-paper">cd apps/api && pnpm wrangler dev --port 8788</code>
        </li>
      </ol>
    </div>
  );
}

function EmptyQueue({ filtered }: { filtered: boolean }) {
  if (filtered) {
    return (
      <div className="rounded-2xl border border-fence bg-card p-10 text-center">
        <h2 className="m-0 font-display text-lg font-extrabold">Под фильтр ничего нет</h2>
        <p className="mt-2 text-[13px] text-mist">
          В очереди нет статей под выбранную рубрику/подкатегорию.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-pill border border-fence bg-night px-4 py-1.5 text-[12px] text-paper hover:border-gold/60"
        >
          Показать всё
        </Link>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-fence bg-card p-10 text-center">
      <h2 className="m-0 font-display text-lg font-extrabold">Очередь пуста</h2>
      <p className="mt-2 text-[13px] text-mist">
        Pipeline не оставил статей со статусом ready. Запусти прогон:
      </p>
      <code className="mt-3 inline-block rounded-lg bg-night px-3 py-2 font-mono text-[12px] text-mist">
        POST {`{X10_API_BASE_URL}`}/v1/pipeline/run
      </code>
    </div>
  );
}

function QueueList({ items }: { items: QueueItem[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/article/${item.id}`}
            className="block rounded-2xl border border-fence bg-card p-5 transition-colors hover:border-gold/60"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.15em]">
              <span className="text-red">{CATEGORY_LABELS[item.category]}</span>
              {item.subcategory && (
                <span className="font-mono normal-case text-haze">{item.subcategory}</span>
              )}
              <span className="rounded-pill border border-fence bg-night px-2 py-0.5 font-mono normal-case tracking-normal text-gold">
                {TEMPLATE_LABELS[item.template]}
              </span>
              <span className="text-haze">·</span>
              <span className="text-haze">{Math.round(item.readSeconds / 60)} мин</span>
              <span className="text-haze">·</span>
              <time className="font-mono text-haze">{formatDate(item.createdAt)}</time>
            </div>
            <h3 className="m-0 mb-2 font-display text-lg font-extrabold leading-tight">
              {item.tease}
            </h3>
            <p className="m-0 text-[13px] leading-relaxed text-mist">{item.lede}</p>

            <div className="mt-4 flex items-center gap-2">
              <ScoreBadge total={item.scoreTotal} verdict={item.scoreVerdict} />
              <FactCheckBadge status={item.factcheckStatus} />
              {item.tags.length > 0 && (
                <span className="font-mono text-[10px] text-haze" title={item.tags.join(" ")}>
                  {item.tags.slice(0, 3).map((t) => `#${t}`).join(" ")}
                  {item.tags.length > 3 ? ` +${item.tags.length - 3}` : ""}
                </span>
              )}
              <span className="ml-auto font-mono text-[11px] text-haze">{item.wordCount} слов</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ScoreBadge({ total, verdict }: { total: number | null; verdict: string | null }) {
  if (total === null) {
    return (
      <span className="rounded-pill border border-fence bg-night px-2.5 py-1 font-mono text-[11px] text-haze">
        — нет score
      </span>
    );
  }
  const cls =
    total >= 40
      ? "border-success/40 bg-success/10 text-success"
      : total >= 30
        ? "border-gold/40 bg-gold/10 text-gold"
        : "border-red/40 bg-red/10 text-red";
  return (
    <span className={`rounded-pill border px-2.5 py-1 font-mono text-[11px] ${cls}`} title={verdict ?? undefined}>
      score {total}/50
    </span>
  );
}

function FactCheckBadge({
  status,
}: {
  status: "passed" | "review-needed" | "halt" | null;
}) {
  if (!status) return null;
  const cls =
    status === "passed"
      ? "border-success/40 bg-success/10 text-success"
      : status === "review-needed"
        ? "border-gold/40 bg-gold/10 text-gold"
        : "border-red/40 bg-red/10 text-red";
  const label =
    status === "passed" ? "fact ✓" : status === "review-needed" ? "fact ?" : "fact ✕";
  return (
    <span className={`rounded-pill border px-2.5 py-1 font-mono text-[11px] ${cls}`}>{label}</span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
