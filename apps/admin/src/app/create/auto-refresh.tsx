"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Пока задание в работе, экран обновляет сам себя.
 *
 * Без этого «выполняется» висело бы до ручной перезагрузки, и человек решил
 * бы, что система зависла. Обновляем не запросом данных из клиента, а
 * `router.refresh()` — серверные компоненты перерисовываются своим обычным
 * путём, и второго источника данных не появляется.
 *
 * Компонент монтируется ТОЛЬКО когда есть что ждать: постоянный опрос ради
 * пустого списка грел бы сервер круглые сутки.
 */
export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);

  return null;
}
