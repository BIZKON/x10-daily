import { loadDigest } from "@/lib/feed";
import { Newspaper, Sparkles } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";

/**
 * issueDate (YYYY-MM-DD, МСК-календарный день) → «среда, 11 июня».
 * Парсим как UTC-полдень и форматируем в UTC — выводим именно этот день
 * без сдвига часового пояса рантайма. "" → null (eyebrow без даты).
 */
function formatDigestDate(issueDate: string): string | null {
  if (!issueDate) return null;
  const d = new Date(`${issueDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(d);
}

export async function HeroDigest() {
  // Динамическая дыра PPR: connection() внутри Suspense-границы → на билде
  // hero НЕ запекается (иначе вшился бы build-time fallback), в рантайме
  // тянет живой API. Кэш 15м — на loadDigest («use cache»).
  await connection();
  const digest = await loadDigest();
  const dateLabel = formatDigestDate(digest.issueDate);

  return (
    <section className="relative mx-4 mb-5 overflow-hidden rounded-[20px] p-5 text-white [background:linear-gradient(135deg,var(--color-red)_0%,var(--color-red-deep)_100%)]">
      <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/[0.06]" />
      <div className="absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-white/[0.04]" />

      <div className="relative mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={14} strokeWidth={2} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] opacity-90">
            {dateLabel ?? "Дайджест"}
          </span>
        </div>
        <span className="flex items-center gap-1.5 rounded-pill bg-white/15 px-3 py-1.5 text-[11px] font-medium backdrop-blur-md">
          <Newspaper size={12} strokeWidth={2} />
          Дайджест
        </span>
      </div>

      <h2 className="relative mb-2 font-display text-[25px] font-extrabold leading-[1.1]">
        Главное сегодня
      </h2>
      {digest.intro && (
        <p className="relative mb-4 text-[13px] leading-[1.45] opacity-90">{digest.intro}</p>
      )}

      {digest.bullets.length > 0 && (
        <ul className="relative flex flex-col gap-3">
          {digest.bullets.map((b) => (
            <li key={b.n}>
              <Link
                href={`/article/${b.slug}`}
                className="flex gap-3 text-[13px] leading-[1.5] transition-opacity active:opacity-70"
              >
                <span className="x10-num font-bold opacity-60">{b.n}</span>
                <span className="opacity-95">{b.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {digest.ctaSlug && (
        <Link
          href={`/article/${digest.ctaSlug}`}
          className="mt-5 block w-full rounded-xl bg-white py-3 text-center font-display text-sm font-semibold text-red"
        >
          Читать разбор →
        </Link>
      )}
    </section>
  );
}
