"use client";

import { track } from "@/lib/analytics";
import { getBookmarkStateAction, toggleBookmarkAction } from "@/lib/engagement-actions";
import { Bookmark } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

/**
 * HeaderBookmark — прометная кнопка «Сохранить» в sticky-header читалки
 * (рядом с «Поделиться»). Единый контрол закладки статьи (из engagement-бара
 * убран, чтобы не было двух рассинхронных состояний).
 *
 * Состояние подгружается лениво при маунте (getBookmarkStateAction — per-user,
 * как CardReactions), т.к. тело статьи кэшируется и не содержит auth-данных.
 * Тап → optimistic + persist (toggleBookmarkAction). Во время запроса кнопка
 * disabled (isPending) — сериализует тапы, исключая рассинхрон при out-of-order
 * ответах. Вне Telegram → подсказка. Сохранённое видно в Профиль →
 * «Сохранённое» (/profile/saved).
 */
export function HeaderBookmark({ articleId }: { articleId: string }) {
  const [saved, setSaved] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ленивая подгрузка состояния при маунте.
  useEffect(() => {
    let alive = true;
    getBookmarkStateAction(articleId)
      .then((b) => {
        if (alive) setSaved(b);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [articleId]);

  // Cleanup hint-таймера при unmount (нет setState на удалённом компоненте).
  useEffect(
    () => () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    [],
  );

  const showHint = (msg: string) => {
    setHint(msg);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 1800);
  };

  const toggle = () => {
    if (isPending) return; // защита от мультиклика (кнопка и так disabled)
    const prev = saved;
    setSaved(!prev); // optimistic
    setHint(null);
    startTransition(async () => {
      const res = await toggleBookmarkAction(articleId);
      if (res.ok) {
        setSaved(res.data.isBookmarked);
        track("bookmark", { article_id: articleId, saved: res.data.isBookmarked });
      } else {
        setSaved(prev); // откат
        showHint(res.reason === "no_auth" ? "Войдите через Telegram" : "Не удалось");
      }
    });
  };

  return (
    <button
      type="button"
      aria-label={saved ? "Убрать из сохранённого" : "Сохранить в закладки"}
      aria-pressed={saved}
      aria-busy={isPending}
      disabled={isPending}
      onClick={toggle}
      className="relative transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-60"
    >
      <Bookmark
        size={20}
        strokeWidth={1.75}
        fill={saved ? "currentColor" : "none"}
        className={saved ? "text-gold" : "text-mist"}
      />
      {hint && (
        <span
          role="status"
          className="absolute -bottom-8 right-0 max-w-[70vw] whitespace-nowrap rounded-md border border-fence bg-card px-2 py-1 text-[11px] text-paper shadow-lg"
        >
          {hint}
        </span>
      )}
    </button>
  );
}
