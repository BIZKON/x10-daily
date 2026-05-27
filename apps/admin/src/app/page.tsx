import Link from "next/link";
import { fetchQueue, type AdminCategory, type AdminTemplate, type QueueItem } from "@/lib/api";

/** brief §5 — user-facing категории. */
const CATEGORY_LABELS: Record<AdminCategory, string> = {
  taxes: "Налоги",
  money: "Деньги",
  practice: "Практика",
  power: "Власть",
  tech: "Технологии",
  rybakov: "Рыбаков",
};

/** brief §3 — шаблоны. */
const TEMPLATE_LABELS: Record<AdminTemplate, string> = {
  "card-news": "card-news",
  "deep-dive": "deep-dive",
  "daily-take": "daily-take",
  guide: "guide",
  digest: "digest",
};

export default async function QueuePage() {
  const queue = await fetchQueue(50);

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
            {queue.count} в очереди
          </span>
        )}
      </header>

      {!queue ? <ApiUnreachable /> : queue.count === 0 ? <EmptyQueue /> : <QueueList items={queue.items} />}
    </>
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

function EmptyQueue() {
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
