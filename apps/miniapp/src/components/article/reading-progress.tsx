"use client";

import { reportProgressAction } from "@/lib/engagement-actions";
/**
 * ReadingProgress — невидимый компонент.
 *
 * Слушает scroll, вычисляет (scrollY + clientHeight) / scrollHeight,
 * шлёт reportProgressAction throttle 5 с (только если процент вырос).
 * На visibilitychange=hidden — финальный beacon. На unmount — тоже.
 *
 * Brief §11 — «среднее время чтения карточки ≥ 60%», «дочитавших лонгрид ≥ 35%».
 * Точность нам не критична на пиксель — критично fire-and-forget без блокировки.
 *
 * Серверный триггер mark_reading_completed (миграция 0003) выставит
 * completed=true при readPercent ≥ 90.
 */
import { useEffect, useRef } from "react";

const THROTTLE_MS = 5000;

export function ReadingProgress({ articleId }: { articleId: string }) {
  // Не инициализируем Date.now() в render — Next.js 16 PPR это запрещает
  // (`next-prerender-current-time-client`). Стартовое время выставляется в useEffect.
  const startedAtRef = useRef<number>(0);
  const lastReportRef = useRef<{ at: number; percent: number }>({
    at: 0,
    percent: 0,
  });

  useEffect(() => {
    startedAtRef.current = Date.now();
    lastReportRef.current = { at: 0, percent: 0 };

    let rafId: number | null = null;

    const compute = (): number => {
      const doc = document.documentElement;
      const total = doc.scrollHeight - doc.clientHeight;
      if (total <= 0) return 100; // короткая статья — сразу 100%
      const ratio = (window.scrollY + doc.clientHeight) / doc.scrollHeight;
      return Math.max(0, Math.min(100, Math.round(ratio * 100)));
    };

    const report = (force: boolean) => {
      const percent = compute();
      const now = Date.now();
      const last = lastReportRef.current;
      if (!force) {
        if (now - last.at < THROTTLE_MS) return;
        if (percent <= last.percent) return;
      }
      lastReportRef.current = { at: now, percent };
      const elapsedSec = Math.round((now - startedAtRef.current) / 1000);
      // fire-and-forget; ошибки никак не показываем
      void reportProgressAction(articleId, percent, elapsedSec);
    };

    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        report(false);
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") report(true);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    // Первый отчёт через 2 с — «успел открыть и не сразу ушёл».
    const initialTimer = window.setTimeout(() => report(true), 2000);

    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(initialTimer);
      if (rafId !== null) cancelAnimationFrame(rafId);
      report(true);
    };
  }, [articleId]);

  return null;
}
