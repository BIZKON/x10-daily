"use client";

import { track } from "@/lib/analytics";
/**
 * TrackArticleOpen — невидимый клиентский компонент: шлёт `article_open` с
 * метаданными статьи (рубрика/шаблон/премиум) на маунте читалки. $pageview
 * уже ловит факт открытия маршрута; это событие добавляет контентный контекст
 * для воронок «открыл → реакция/закладка/шер». Без ПДн.
 */
import { useEffect } from "react";

export function TrackArticleOpen({
  slug,
  category,
  template,
  isPremium,
  readMinutes,
}: {
  slug: string;
  category: string;
  template: string;
  isPremium: boolean;
  readMinutes: number;
}) {
  useEffect(() => {
    track("article_open", {
      slug,
      category,
      template,
      is_premium: isPremium,
      read_minutes: readMinutes,
    });
  }, [slug, category, template, isPremium, readMinutes]);

  return null;
}
