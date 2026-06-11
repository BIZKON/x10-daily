import { TopBar } from "@/components/top-bar";
import { TAXES_FILTERS, TAXES_ITEMS, TAXES_METRICS } from "@/lib/feed";
import { cn } from "@x10/ui";
import {
  BarChart3,
  Calendar,
  ChevronRight,
  Flame,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";

const iconMap = {
  "chart-bar": BarChart3,
  "trending-up": TrendingUp,
  calendar: Calendar,
} as const;

export default function TaxesPage() {
  return (
    <>
      <TopBar title="Налоги" />

      <section className="relative overflow-hidden border-b border-fence px-5 pb-7 pt-5 [background:linear-gradient(135deg,#1A0B0C_0%,var(--color-night)_60%)]">
        <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-red/[0.06]" />
        <span className="relative text-[10px] font-extrabold uppercase tracking-[0.15em] text-red">
          Рубрика
        </span>
        <h1 className="relative m-0 mt-1.5 font-display text-[34px] font-extrabold leading-[1.1]">
          Налоги
        </h1>
        <p className="relative m-0 mt-2 text-[13.5px] leading-[1.5] text-mist">
          Что меняется в НК РФ, как платить меньше легально, как разговаривать с ФНС.
        </p>
        <div className="relative mt-5 grid grid-cols-3 gap-2.5">
          {TAXES_METRICS.map((m) => {
            const Icon = iconMap[m.icon];
            return (
              <div key={m.k} className="rounded-xl border border-fence bg-card p-3">
                <Icon size={14} strokeWidth={1.75} className="mb-1.5 block text-gold" />
                <div className="x10-num text-lg font-extrabold">{m.k}</div>
                <div className="mt-0.5 text-[10px] text-haze">{m.v}</div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex gap-2 overflow-x-auto px-5 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          className="flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-fence bg-card px-3 py-1.5 text-xs font-medium text-mist"
        >
          <SlidersHorizontal size={14} strokeWidth={1.75} /> Фильтры
        </button>
        {TAXES_FILTERS.map((t, i) => (
          <button
            key={t}
            type="button"
            className={cn(
              "whitespace-nowrap rounded-pill px-3 py-1.5 text-xs font-semibold",
              i === 0 ? "bg-red text-white" : "border border-fence bg-card text-mist",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <section className="relative mx-5 mb-5 overflow-hidden rounded-2xl border border-gold/40 p-5 [background:linear-gradient(135deg,rgba(212,162,76,0.08),transparent)]">
        <div className="absolute -bottom-8 -right-8 h-32 w-32 rounded-full bg-gold/[0.03]" />
        <span className="relative text-[10px] font-extrabold uppercase tracking-[0.15em] text-gold">
          ✦ Гид Х10
        </span>
        <h3 className="relative m-0 mt-2 font-display text-[19px] font-extrabold leading-[1.2]">
          Налоговый календарь 2026
        </h3>
        <p className="relative m-0 mt-2 text-[12.5px] text-mist">
          18 ключевых дат для предпринимателя. PDF + интерактивная версия.
        </p>
        <button
          type="button"
          className="relative mt-4 rounded-xl bg-gold px-4 py-2.5 font-display text-[13px] font-extrabold text-steel"
        >
          Открыть гид →
        </button>
      </section>

      <ul className="m-0 flex flex-col gap-2.5 px-5 pb-6">
        {TAXES_ITEMS.map((it) => (
          <li
            key={it.title}
            className="flex gap-3 rounded-xl border border-fence bg-card p-3.5 transition-transform active:scale-[0.99]"
          >
            <div className={cn("w-1 rounded-pill", it.hot ? "bg-red" : "bg-fence")} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-red">
                  {it.tag}
                </span>
                {it.hot && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-gold">
                    <Flame size={12} strokeWidth={2} /> HOT
                  </span>
                )}
              </div>
              <h4 className="m-0 mt-1 mb-1.5 font-display text-[15px] font-extrabold leading-[1.25]">
                {it.title}
              </h4>
              <span className="text-[11px] text-haze">{it.minutes} мин чтения</span>
            </div>
            <ChevronRight size={16} strokeWidth={1.75} className="self-center text-haze" />
          </li>
        ))}
      </ul>
    </>
  );
}
