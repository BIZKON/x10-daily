"use client";

import type { AdminCarouselItem } from "@/lib/api";
import { Check, RefreshCw, X } from "lucide-react";
import { useState, useTransition } from "react";

/**
 * Карточка ревью одной карусели — HumanGate на слайды (реестр §3.5).
 *
 * 🔴 Слайды показываются лентой в том же порядке, в каком уйдут в канал:
 * порядок и есть смысл карусели, и проверять его надо глазами, а не по
 * подписям. Кнопки блокируются на время запроса: «Одобрить» ставит альбом в
 * очередь публикации, двойной клик тут — двойная публикация.
 */
export function CarouselCard({
  item,
  status,
  onApprove,
  onReject,
  onRemake,
}: {
  item: AdminCarouselItem;
  status: string;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onRemake: (id: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const run = (action: (id: string) => Promise<void>, label: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await action(item.id);
        setDone(label);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось выполнить действие");
      }
    });
  };

  return (
    <section className="rounded-2xl border border-fence bg-card p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className="m-0 font-display text-[15px] font-extrabold">{item.tease}</h3>
        <span className="shrink-0 font-mono text-[12px] text-haze">
          {item.slides.length} слайдов
        </span>
      </div>
      <p className="m-0 mb-3 line-clamp-2 text-[12.5px] leading-relaxed text-mist">{item.lede}</p>

      {/* Лента слайдов по горизонтали: так их и листает читатель. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
        {item.slides.map((s) => (
          <figure key={s.url} className="m-0 shrink-0">
            {/* Слайды лежат на том же томе, что обложки, и раздаются Caddy —
                оптимизатор Next тут только добавил бы проход через сервер. */}
            <img
              src={s.url}
              alt={`Слайд ${s.index}: ${s.title}`}
              width={144}
              height={180}
              className="rounded-lg border border-fence"
            />
            <figcaption className="mt-1 text-center font-mono text-[11px] text-haze">
              {s.index}
            </figcaption>
          </figure>
        ))}
      </div>

      {done ? (
        <p className="m-0 text-[13px] text-success">{done}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {status === "pending_review" && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(onApprove, "Одобрено — альбом встал в очередь публикации.")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-success px-3.5 py-2 text-[13px] font-bold text-ink disabled:opacity-60"
              >
                <Check size={14} /> Одобрить
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(onReject, "Отклонено — в канал не пойдёт.")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red/50 px-3.5 py-2 text-[13px] font-bold text-red disabled:opacity-60"
              >
                <X size={14} /> Отклонить
              </button>
            </>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(onRemake, "Просим нарисовать заново — обновите страницу через минуту.")
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-fence px-3.5 py-2 text-[13px] font-bold text-mist disabled:opacity-60"
          >
            <RefreshCw size={14} /> Нарисовать заново
          </button>
        </div>
      )}

      {error && <p className="mt-2 mb-0 text-[12.5px] text-red">{error}</p>}
    </section>
  );
}
