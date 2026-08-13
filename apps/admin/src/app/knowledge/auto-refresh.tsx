"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Обновлять страницу, пока обход идёт.
 *
 * Без этого экран показывает «Читаем сайт» и ждёт, что человек догадается нажать
 * F5 — а обход длится минуту-две, и всё это время непонятно, живой он или завис.
 *
 * ⚠️ Это НЕ «useEffect + fetch», запрещённый правилами проекта: своих данных
 * компонент не грузит и состояния не держит. `router.refresh()` просит сервер
 * перерисовать серверные компоненты — данные приходят тем же путём, что и при
 * первой отрисовке, одним источником правды.
 *
 * Рисуется только пока задание в работе: вечный опрос готового разбора грел бы
 * сервер без причины.
 */
export function AutoRefresh({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return null;
}
