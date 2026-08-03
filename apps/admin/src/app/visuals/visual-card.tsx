"use client";

import type { VisualQueueItem } from "@/lib/api";
import { Check, RefreshCw, X } from "lucide-react";
import { useState, useTransition } from "react";

/**
 * Карточка ревью одной обложки. Клиентский компонент — нужны pending-состояние
 * и текст ошибки без перезагрузки страницы.
 *
 * Кнопки блокируются на время запроса (isPending): одобрение выпускает картинку
 * в канал, поэтому двойной клик и гонка решений недопустимы.
 */
export function VisualCard({
  item,
  onApprove,
  onReject,
  onRegenerate,
}: {
  item: VisualQueueItem;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onRegenerate: (id: string) => Promise<void>;
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
    <article className="overflow-hidden rounded-2xl border border-fence bg-card">
      {item.coverImageUrl ? (
        // Обычный <img>: обложки раздаёт Caddy с прод-домена, оптимизатор
        // next/image админке не нужен (внутренний инструмент, трафик мал).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.coverImageUrl}
          alt=""
          className="aspect-[16/9] w-full bg-fence/40 object-cover"
          loading="lazy"
        />
      ) : (
        <div className="grid aspect-[16/9] w-full place-items-center bg-fence/40 text-[13px] text-haze">
          Картинки нет
        </div>
      )}

      <div className="p-5">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-haze">
          <span>{item.category ?? "news"}</span>
          <span>·</span>
          <span className="font-mono normal-case tracking-normal">{item.slug}</span>
        </div>

        <h3 className="m-0 font-display text-[16px] font-extrabold leading-[1.3]">{item.tease}</h3>
        <p className="mt-1.5 text-[13px] leading-[1.5] text-mist">{item.lede}</p>

        {item.visualPrompt && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[12px] text-haze hover:text-mist">
              Промпт иллюстрации
            </summary>
            <p className="mt-1.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.5] text-haze">
              {item.visualPrompt}
            </p>
          </details>
        )}

        {done ? (
          <p className="mt-4 text-[13px] font-semibold text-success">{done}</p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || !item.coverImageUrl}
              onClick={() => run(onApprove, "Одобрено — уйдёт фото-постом")}
              className="flex items-center gap-1.5 rounded-lg bg-success/15 px-3 py-2 text-[13px] font-semibold text-success disabled:opacity-50"
            >
              <Check size={14} strokeWidth={2} /> Одобрить
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(onRegenerate, "Перегенерация запущена")}
              className="flex items-center gap-1.5 rounded-lg bg-fence/50 px-3 py-2 text-[13px] font-semibold text-paper disabled:opacity-50"
            >
              <RefreshCw size={14} strokeWidth={2} /> Перегенерировать
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(onReject, "Без картинки — уйдёт текстом")}
              className="flex items-center gap-1.5 rounded-lg bg-red/15 px-3 py-2 text-[13px] font-semibold text-red disabled:opacity-50"
            >
              <X size={14} strokeWidth={2} /> Без картинки
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-[12px] text-red">{error}</p>}
      </div>
    </article>
  );
}
