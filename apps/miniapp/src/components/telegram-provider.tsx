"use client";

/**
 * Bootstrap Telegram Mini App SDK + auto-login (HIGH-2).
 *
 * При маунте:
 * 1. Если запущены внутри TG WebView (window.Telegram.WebApp присутствует) —
 *    читаем initData и вызываем loginWithTelegramAction (Server Action).
 *    Cookie ставится на стороне Next.js, client не имеет к нему доступа.
 * 2. Иначе (dev в обычном браузере) — fallback на devLoginAction,
 *    который в dev-режиме использует X10_DEV_USER_ID env. В prod no-op.
 *
 * Idempotent: ref-guard защищает от повторных вызовов при ремаунтах в Strict Mode.
 * После успешного логина страницы могут потребовать reload — Server Actions
 * не триггерят rerender RSC автоматически. Это известное ограничение MVP
 * (исправится через router.refresh() в TelegramProvider после login.success).
 */

import { devLoginAction, loginWithTelegramAction } from "@/lib/auth-actions";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand?: () => void;
}

function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { Telegram?: { WebApp?: TelegramWebApp } };
  return w.Telegram?.WebApp ?? null;
}

export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const calledRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const tg = getTelegramWebApp();

    if (tg?.initData) {
      tg.ready();
      tg.expand?.();
      loginWithTelegramAction(tg.initData)
        .then((result) => {
          if (result.ok) router.refresh();
        })
        .catch((err) => {
          console.error("[tg-auth] login failed", err);
        });
      return;
    }

    devLoginAction()
      .then((result) => {
        if (result.ok) router.refresh();
      })
      .catch((err) => {
        console.error("[tg-auth] dev login failed", err);
      });
  }, [router]);

  return <>{children}</>;
}
