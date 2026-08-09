import { Hammer } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Заготовка раздела, который обещан клиенту, но ещё не построен.
 *
 * 🔴 Заготовка ЧЕСТНАЯ. Пустой экран без объяснения читается как поломка, а
 * нарисованные фальшивые данные — как обман: клиент нажмёт и увидит, что ничего
 * не происходит. Поэтому здесь прямо сказано «раздел готовится», рядом — что
 * тут появится и что делать до тех пор.
 *
 * Каждый пункт списка — то, чем клиент будет управлять сам. Это же список
 * работ для нас: пока он не закрыт, раздел остаётся заготовкой.
 */
export function Soon({
  icon: Icon,
  title,
  lead,
  will,
  meanwhile,
}: {
  icon: LucideIcon;
  title: string;
  /** Зачем раздел нужен — одним абзацем, словами клиента. */
  lead: string;
  /** Что здесь появится: короткие пункты «действие → результат». */
  will: Array<{ what: string; why: string }>;
  /** Как это делается сейчас, пока раздела нет. */
  meanwhile: string;
}) {
  return (
    <>
      <header className="mb-6 border-b border-fence pb-5">
        <h1 className="m-0 flex items-center gap-2 font-display text-2xl font-extrabold">
          <Icon size={22} strokeWidth={1.75} /> {title}
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-gold/15 px-2.5 py-1 text-[11px] font-bold tracking-wide text-gold">
            <Hammer size={11} strokeWidth={2.5} /> ГОТОВИТСЯ
          </span>
        </h1>
        <p className="mt-1.5 max-w-[68ch] text-[13px] leading-[1.55] text-mist">{lead}</p>
      </header>

      <section className="mb-5">
        <h2 className="mb-3 font-display text-[13px] font-bold uppercase tracking-[0.1em] text-mist">
          Что здесь появится
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {will.map((w) => (
            <div key={w.what} className="rounded-2xl border border-fence bg-card p-4">
              <div className="font-display text-[15px] font-bold">{w.what}</div>
              <div className="mt-1 text-[13px] leading-[1.5] text-mist">{w.why}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="rounded-2xl border border-gold/30 bg-gold/[0.06] p-4 text-[13px] leading-[1.55] text-mist">
        <span className="font-bold text-gold">Пока раздела нет.</span> {meanwhile}
      </div>
    </>
  );
}
