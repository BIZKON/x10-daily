"use client";

import type { ReactionKind } from "@/lib/api";
import { getReactionStateAction, toggleReactionAction } from "@/lib/engagement-actions";
import { SmilePlus } from "lucide-react";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";

/**
 * CardReactions (П2) — живые реакции прямо в ленте через выпадающую панель.
 *
 * Раньше под карточкой был статичный Heart + число (не кнопка, карточка = Link).
 * Теперь: компактный триггер (доминирующий смайл + сумма) → тап раскрывает
 * панель с 🔥/💡/🤔 и живыми счётчиками. Тап по смайлу = toggle с optimistic
 * (≤16 мс, brief §11) и persist через server action.
 *
 * State: useOptimistic поверх committed (как в EngagementBar читалки) —
 * редьюсер видит АКТУАЛЬНЫЙ optimistic-state, поэтому быстрые повторные тапы
 * считаются корректно (не stale-wasOn), а при ошибке optimistic откатывается
 * сам (committed не менялся). Сервер — источник истины: на success пишем counts
 * + userReacted в committed.
 *
 * ⚠️ Карточка = «stretched link» (Link absolute z-[1]); контрол на z-[2]
 * СИБЛИНГ ссылки (не вложен в <a>), тап по реакции НЕ навигирует.
 *
 * ⚠️ Лента кэшируется («use cache»), per-user реакций в ней нет — узнаём лениво
 * (getReactionStateAction) при открытии: подсветка активных + корректный toggle.
 * loadedMineRef-гард: поздний /me НЕ затирает серверную правду уже сделанного
 * toggle. Auth есть внутри Telegram; вне TG → подсказка.
 */
type Counts = { fire: number; insight: number; question: number };
type Mine = { fire: boolean; insight: boolean; question: boolean };
type State = { counts: Counts; mine: Mine };

const KINDS: Array<{ kind: ReactionKind; emoji: string; label: string }> = [
  { kind: "fire", emoji: "🔥", label: "Огонь" },
  { kind: "insight", emoji: "💡", label: "Инсайт" },
  { kind: "question", emoji: "🤔", label: "Вопрос" },
];

const ZERO_MINE: Mine = { fire: false, insight: false, question: false };

export function CardReactions({
  articleId,
  initialCounts,
}: {
  articleId: string;
  initialCounts: Counts;
}) {
  const [committed, setCommitted] = useState<State>({ counts: initialCounts, mine: ZERO_MINE });
  const loadedMineRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [optimistic, applyOptimistic] = useOptimistic(
    committed,
    (cur, kind: ReactionKind): State => {
      const wasOn = cur.mine[kind];
      return {
        counts: { ...cur.counts, [kind]: Math.max(0, cur.counts[kind] + (wasOn ? -1 : 1)) },
        mine: { ...cur.mine, [kind]: !wasOn },
      };
    },
  );

  const total = optimistic.counts.fire + optimistic.counts.insight + optimistic.counts.question;
  // reduce без initialValue → возвращает элемент (не T|undefined); KINDS непуст.
  const dominant = KINDS.reduce((best, k) =>
    optimistic.counts[k.kind] > optimistic.counts[best.kind] ? k : best,
  );

  // Escape закрывает панель (клавиатурная доступность).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const openPanel = () => {
    setOpen(true);
    setHint(null);
    if (!loadedMineRef.current) {
      startTransition(async () => {
        const m = await getReactionStateAction(articleId);
        // Гард: не затираем mine, если toggle уже зафиксировал серверную правду.
        if (!loadedMineRef.current) {
          loadedMineRef.current = true;
          setCommitted((prev) => ({ counts: prev.counts, mine: m }));
        }
      });
    }
  };

  const handleReact = (kind: ReactionKind) => {
    setHint(null);
    startTransition(async () => {
      applyOptimistic(kind);
      const result = await toggleReactionAction(articleId, kind);
      if (result.ok) {
        loadedMineRef.current = true;
        setCommitted((prev) => ({
          counts: result.data.reactions,
          mine: { ...prev.mine, [kind]: result.data.userReacted },
        }));
      } else {
        // optimistic откатится сам при завершении transition (committed не менялся).
        setHint(
          result.reason === "no_auth"
            ? "Откройте в Telegram, чтобы реагировать"
            : "Не удалось — попробуйте ещё раз",
        );
      }
    });
  };

  return (
    <div className="relative z-[2]">
      <button
        type="button"
        onClick={openPanel}
        aria-label="Поставить реакцию"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-pill border border-fence bg-night/40 px-2.5 py-1 text-[12px] text-haze transition-colors hover:border-red/40 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        {total > 0 ? (
          <>
            <span className="text-[14px] leading-none">{dominant.emoji}</span>
            <span className="tabular-nums">{total}</span>
          </>
        ) : (
          <>
            <SmilePlus size={14} strokeWidth={1.75} />
            <span className="font-medium">Реакция</span>
          </>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop — тап вне панели закрывает. */}
          <button
            type="button"
            aria-label="Закрыть панель реакций"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          {/* Визуальная панель — без ARIA-role (не меню); кнопки внутри сами
              озвучиваются (aria-label/aria-pressed). Закрытие: backdrop / Escape. */}
          <div className="absolute bottom-full right-0 z-50 mb-2 rounded-2xl border border-fence bg-card p-1.5 shadow-xl shadow-night/50">
            <div className="flex items-center gap-1">
              {KINDS.map(({ kind, emoji, label }) => {
                const isOn = optimistic.mine[kind];
                return (
                  <button
                    key={kind}
                    type="button"
                    aria-label={`${label} (${optimistic.counts[kind]})`}
                    aria-pressed={isOn}
                    onClick={() => handleReact(kind)}
                    className={
                      isOn
                        ? "flex items-center gap-1 rounded-pill border border-red bg-red/15 px-2.5 py-1.5 text-[13px] font-semibold text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                        : "flex items-center gap-1 rounded-pill border border-transparent px-2.5 py-1.5 text-[13px] text-mist transition-colors hover:bg-night/50 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                    }
                  >
                    <span className="text-[17px] leading-none">{emoji}</span>
                    <span className="tabular-nums">{optimistic.counts[kind]}</span>
                  </button>
                );
              })}
            </div>
            {hint && (
              <p className="m-0 max-w-[210px] px-2 pb-0.5 pt-1.5 text-[11px] leading-snug text-haze">
                {hint}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
