"use client";

import type { ApiArticleUserState, ReactionKind } from "@/lib/api";
import { toggleReactionAction } from "@/lib/engagement-actions";
/**
 * EngagementBar — реакции (3 kind) + visual comment counter.
 *
 * Brief §11 PERF — ≤16 мс на клик. useOptimistic применяет update синхронно
 * в одном React-коммите; Server Action улетает фоном; ошибка → revert
 * (state не меняется, optimistic clears на конце transition).
 *
 * Reaction kinds — те же что в БД enum (brief §6): fire, insight, question.
 * Закладка вынесена в header читалки (HeaderBookmark) — единый контрол, без
 * рассинхрона двух optimistic-состояний.
 */
import { MessageCircle } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";

type ReactionCounts = { fire: number; insight: number; question: number };
type ReactionMine = { fire: boolean; insight: boolean; question: boolean };

type ReactionState = { counts: ReactionCounts; mine: ReactionMine };

const REACTIONS: Array<{ kind: ReactionKind; emoji: string; label: string }> = [
  { kind: "fire", emoji: "🔥", label: "Огонь" },
  { kind: "insight", emoji: "💡", label: "Инсайт" },
  { kind: "question", emoji: "🤔", label: "Вопрос" },
];

export function EngagementBar({
  articleId,
  initialUserState,
  initialReactions,
  commentCount,
}: {
  articleId: string;
  initialUserState: ApiArticleUserState;
  initialReactions: ReactionCounts;
  commentCount: number;
}) {
  const [reactionState, setReactionState] = useState<ReactionState>({
    counts: initialReactions,
    mine: initialUserState.userReactions,
  });

  const [optimisticReaction, applyOptimisticReaction] = useOptimistic(
    reactionState,
    (current, kind: ReactionKind): ReactionState => {
      const wasOn = current.mine[kind];
      return {
        mine: { ...current.mine, [kind]: !wasOn },
        counts: {
          ...current.counts,
          [kind]: Math.max(0, current.counts[kind] + (wasOn ? -1 : 1)),
        },
      };
    },
  );

  const [, startTransition] = useTransition();

  const handleReaction = (kind: ReactionKind) => {
    startTransition(async () => {
      applyOptimisticReaction(kind);
      const result = await toggleReactionAction(articleId, kind);
      if (result.ok) {
        setReactionState((prev) => ({
          counts: result.data.reactions,
          mine: { ...prev.mine, [kind]: result.data.userReacted },
        }));
      }
    });
  };

  return (
    <div className="mt-8 flex items-center justify-between border-t border-fence pt-4">
      <div className="flex gap-2">
        {REACTIONS.map(({ kind, emoji, label }) => {
          const isOn = optimisticReaction.mine[kind];
          const count = optimisticReaction.counts[kind];
          return (
            <button
              key={kind}
              type="button"
              aria-label={`${label} (${count})`}
              aria-pressed={isOn}
              onClick={() => handleReaction(kind)}
              className={
                isOn
                  ? "flex items-center gap-1.5 rounded-pill border border-red bg-red/15 px-3 py-1.5 text-[13px] font-semibold text-paper transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  : "flex items-center gap-1.5 rounded-pill border border-fence bg-card px-3 py-1.5 text-[13px] text-mist transition-colors hover:border-red/40 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              }
            >
              <span className="text-[15px] leading-none">{emoji}</span>
              <span className="tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>
      {commentCount > 0 && (
        <span className="flex items-center gap-1.5 text-[13px] text-mist">
          <MessageCircle size={16} strokeWidth={1.75} className="text-red" />
          <span className="tabular-nums">{commentCount}</span>
        </span>
      )}
    </div>
  );
}
