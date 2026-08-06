"use client";

import type { AdminSource } from "@/lib/api";
import { Pause, Play, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

/**
 * Одна строка списка источников.
 *
 * 🔴 Состояние показываем ОДНИМ понятным словом. В базе их два — `enabled`
 * (по нему ходит крон) и `status` (смысл жизненного цикла), — но клиенту две
 * технические колонки объяснить нельзя, а перепутать их легко.
 */
function sourceState(s: AdminSource): {
  label: string;
  tone: "ok" | "wait" | "bad" | "off";
  note?: string;
} {
  if (s.enabled) return { label: "Работает", tone: "ok" };
  if (s.status === "inactive") return { label: "Выключен", tone: "off" };
  // pending + пометка об ошибке = проверка прошла и не удалась.
  if (s.notes && /^(Не удалось|Фид прочитан, но)/.test(s.notes)) {
    return { label: "Не работает", tone: "bad", note: s.notes };
  }
  return { label: "Проверяем ленту", tone: "wait" };
}

const TONE: Record<string, string> = {
  ok: "border-success/40 bg-success/10 text-success",
  wait: "border-gold/40 bg-gold/10 text-gold",
  bad: "border-red/40 bg-red/10 text-red",
  off: "border-fence bg-fence/30 text-haze",
};

export function SourceRow({
  source,
  onToggle,
  onDelete,
}: {
  source: AdminSource;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const st = sourceState(source);

  const run = (fn: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось выполнить действие");
      }
    });
  };

  return (
    <div className="rounded-xl border border-fence bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 truncate font-display text-[15px] font-extrabold">{source.name}</h3>
            <span
              className={`rounded-pill border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] ${TONE[st.tone]}`}
            >
              {st.label}
            </span>
          </div>

          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1 block truncate font-mono text-[11.5px] text-haze hover:text-mist"
            title={source.url}
          >
            {source.url}
          </a>

          {st.note && <p className="m-0 mt-2 text-[12px] leading-[1.5] text-red">{st.note}</p>}
          {!st.note && source.notes && (
            <p className="m-0 mt-2 text-[12px] leading-[1.5] text-mist">{source.notes}</p>
          )}

          <p className="m-0 mt-2 text-[11.5px] text-haze">
            {humanKind(source.adapterType)} · проверка {humanInterval(source.pollIntervalSec)} ·{" "}
            {source.locale === "ru" ? "русский" : "английский"}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          {/* Непроверенный источник включать нечего — api вернёт 409. */}
          {source.status !== "pending" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => onToggle(source.id, !source.enabled))}
              title={source.enabled ? "Приостановить" : "Включить"}
              className="grid h-8 w-8 place-items-center rounded-lg border border-fence text-mist transition hover:text-paper disabled:opacity-50"
            >
              {source.enabled ? (
                <Pause size={14} strokeWidth={2} />
              ) : (
                <Play size={14} strokeWidth={2} />
              )}
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Удалить источник «${source.name}»?`)) return;
              run(() => onDelete(source.id));
            }}
            title="Удалить"
            className="grid h-8 w-8 place-items-center rounded-lg border border-fence text-mist transition hover:border-red/40 hover:text-red disabled:opacity-50"
          >
            <Trash2 size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      {error && <p className="m-0 mt-3 text-[12px] text-red">{error}</p>}
    </div>
  );
}

function humanKind(t: string): string {
  if (t === "youtube") return "YouTube";
  if (t === "github") return "GitHub";
  if (t === "reddit") return "Reddit";
  return "сайт или блог";
}

function humanInterval(sec: number): string {
  if (sec < 3600) return `каждые ${Math.round(sec / 60)} мин`;
  if (sec < 86_400) return `раз в ${Math.round(sec / 3600)} ч`;
  return "раз в сутки";
}
