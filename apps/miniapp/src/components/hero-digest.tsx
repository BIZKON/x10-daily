import { Play, Sparkles } from "lucide-react";
import { DAILY_DIGEST } from "@/lib/feed";

export function HeroDigest() {
  return (
    <section className="relative mx-4 mb-5 overflow-hidden rounded-[20px] p-5 text-white [background:linear-gradient(135deg,var(--color-red)_0%,var(--color-red-deep)_100%)]">
      <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/[0.06]" />
      <div className="absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-white/[0.04]" />

      <div className="relative mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={14} strokeWidth={2} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] opacity-90">
            {DAILY_DIGEST.date}
          </span>
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-pill bg-white/15 px-3 py-1.5 text-[11px] font-medium backdrop-blur-md"
        >
          <Play size={12} fill="currentColor" />
          {DAILY_DIGEST.videoMinutes} мин
        </button>
      </div>

      <h2 className="relative mb-4 font-display text-[25px] font-extrabold leading-[1.1]">
        {DAILY_DIGEST.title}
      </h2>

      <ul className="relative flex flex-col gap-3">
        {DAILY_DIGEST.bullets.map((b) => (
          <li key={b.n} className="flex gap-3 text-[13px] leading-[1.5]">
            <span className="x10-num font-bold opacity-60">{b.n}</span>
            <span className="opacity-95">{b.t}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="mt-5 w-full rounded-xl bg-white py-3 font-display text-sm font-semibold text-red"
      >
        Смотреть полный разбор →
      </button>
    </section>
  );
}
