"use client";

import type { ApiArticleUserState, ReactionKind } from "@/lib/api";
import { toggleBookmarkAction, toggleReactionAction } from "@/lib/engagement-actions";
/**
 * EngagementBar — реакции (3 kind) + закладка + visual comment counter.
 *
 * Brief §11 PERF — ≤16 мс на клик. useOptimistic применяет update синхронно
 * в одном React-коммите; Server Action улетает фоном; ошибка → revert
 * (state не меняется, optimistic clears на конце transition).
 *
 * Reaction kinds — те же что в БД enum (brief §6): fire, insight, question.
 * Прежние 4 эмодзи (🔥💯🤔😱) убраны — 💯 и 😱 не было в backend, UI флипал бы.
 */
import { Bookmark, MessageCircle } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";

type ReactionCounts = { fire: number; insight: number; question: number };
type ReactionMine = { fire: boolean; insight: boolean; question: boolean };

type ReactionState = { counts: ReactionCounts; mine: ReactionMine };
type BookmarkState = { isBookmarked: boolean; count: number };

const REACTIONS: Array<{ kind: ReactionKind; emoji: string; label: string }> = [
  { kind: "fire", emoji: "🔥", label: "Огонь" },
  { kind: "insight", emoji: "💡", label: "Инсайт" },
  { kind: "question", emoji: "🤔", label: "Вопрос" },
];

export function EngagementBar({
  articleId,
  initialUserState,
  initialReactions,
  initialBookmarkCount,
  commentCount,
}: {
  articleId: string;
  initialUserState: ApiArticleUserState;
  initialReactions: ReactionCounts;
  initialBookmarkCount: number;
  commentCount: number;
}) {
  const [reactionState, setReactionState] = useState<ReactionState>({
    counts: initialReactions,
    mine: initialUserState.userReactions,
  });
  const [bookmarkState, setBookmarkState] = useState<BookmarkState>({
    isBookmarked: initialUserState.isBookmarked,
    count: initialBookmarkCount,
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

  const [optimisticBookmark, applyOptimisticBookmark] = useOptimistic(
    bookmarkState,
    (current, _toggle: null): BookmarkState => ({
      isBookmarked: !current.isBookmarked,
      count: Math.max(0, current.count + (current.isBookmarked ? -1 : 1)),
    }),
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

  const handleBookmark = () => {
    startTransition(async () => {
      applyOptimisticBookmark(null);
      const result = await toggleBookmarkAction(articleId);
      if (result.ok) {
        setBookmarkState({
          isBookmarked: result.data.isBookmarked,
          count: result.data.bookmarkCount,
        });
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
                  ? "flex items-center gap-1.5 rounded-pill border border-red bg-red/15 px-3 py-1.5 text-[13px] font-semibold text-paper transition-colors"
                  : "flex items-center gap-1.5 rounded-pill border border-fence bg-card px-3 py-1.5 text-[13px] text-mist transition-colors hover:border-red/40 hover:text-paper"
              }
            >
              <span className="text-[15px] leading-none">{emoji}</span>
              <span className="tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-[13px] text-mist">
        <button
          type="button"
          aria-label={optimisticBookmark.isBookmarked ? "Убрать из сохранённого" : "Сохранить"}
          aria-pressed={optimisticBookmark.isBookmarked}
          onClick={handleBookmark}
          className="flex items-center gap-1.5 transition-colors hover:text-paper"
        >
          <Bookmark
            size={18}
            strokeWidth={1.75}
            fill={optimisticBookmark.isBookmarked ? "currentColor" : "none"}
            className={optimisticBookmark.isBookmarked ? "text-gold" : "text-mist"}
          />
          <span className="tabular-nums">{optimisticBookmark.count}</span>
        </button>
        {commentCount > 0 && (
          <span className="flex items-center gap-1.5">
            <MessageCircle size={16} strokeWidth={1.75} className="text-red" />
            <span className="tabular-nums">{commentCount}</span>
          </span>
        )}
      </div>
    </div>
  );
}
