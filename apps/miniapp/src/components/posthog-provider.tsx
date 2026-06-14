"use client";

import { bootAnalytics, identifyTelegramUser, trackAppOpen, trackPageview } from "@/lib/analytics";
/**
 * PostHogProvider — клиентский bootstrap аналитики (рендерит null).
 *
 * На маунте: init PostHog (лениво) → identify по Telegram id → app_open.
 * На каждую смену маршрута: $pageview (App Router, ручной — capture_pageview
 * выключен). Используем usePathname БЕЗ useSearchParams → не форсит динамику/
 * Suspense, совместимо с PPR. Пустой ключ → всё no-op (см. lib/analytics).
 */
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function PostHogProvider() {
  const pathname = usePathname();

  // init + identify + app_open — один раз на маунт
  useEffect(() => {
    bootAnalytics();
    identifyTelegramUser();
    trackAppOpen();
  }, []);

  // $pageview на каждую смену маршрута (включая первый рендер). pathname читаем
  // в теле (гард) — он и зависимость (триггер на навигацию), и используется.
  useEffect(() => {
    if (pathname) trackPageview();
  }, [pathname]);

  return null;
}
