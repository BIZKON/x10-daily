/**
 * analytics.ts — тонкая обёртка над posthog-js (PostHog Cloud EU).
 *
 * posthog-js грузится ЛЕНИВО (dynamic import в ensure()) → отдельным async-чанком,
 * вне начального бандла (бюджет ≤200 KB/маршрут, CLAUDE.md §2). До первого вызова
 * сеть не трогается. Пустой NEXT_PUBLIC_POSTHOG_KEY → весь модуль no-op (PostHog
 * выключен, приложение работает как раньше) — так дев/демо живут без ключа.
 *
 * PII / 152-ФЗ: identify ТОЛЬКО по Telegram user id (псевдоним), без имени и
 * username; person_profiles=identified_only; запись сессий и опросы выключены;
 * регион EU — клиент ходит через наш /ingest reverse-proxy (Caddy → eu.i.posthog.com),
 * RU-устройства не стучатся в PostHog напрямую.
 *
 * ⚠️ NEXT_PUBLIC_* инлайнятся на БИЛДЕ (Dockerfile build-args), не в рантайме.
 */
import type { PostHog } from "posthog-js";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

let ready: Promise<PostHog | null> | null = null;

/**
 * api_host для posthog-js. По умолчанию — same-origin /ingest (Caddy reverse-proxy
 * на eu.i.posthog.com), поэтому RU-устройства ходят на наш домен и домен НЕ нужно
 * запекать в билд. NEXT_PUBLIC_POSTHOG_HOST — опц. override (напр., прямой EU для теста).
 */
function resolveHost(): string {
  const explicit = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return `${window.location.origin}/ingest`;
}

/** Лениво грузит + инициализирует singleton posthog-js. null = PostHog выключен. */
function ensure(): Promise<PostHog | null> {
  if (typeof window === "undefined" || !KEY) return Promise.resolve(null);
  if (!ready) {
    ready = import("posthog-js")
      .then(({ default: posthog }) => {
        if (!posthog.__loaded) {
          posthog.init(KEY, {
            api_host: resolveHost(),
            ui_host: "https://eu.posthog.com",
            person_profiles: "identified_only",
            capture_pageview: false, // вручную на смену маршрута (App Router)
            capture_pageleave: true,
            // 152-ФЗ: autocapture ВЫКЛ — иначе $el_text/aria-label кликов утаскивает
            // в PostHog видимый текст (заголовки статей/источников). Меряем ЯВНЫМИ
            // событиями (app_open/$pageview/article_open/reaction/bookmark/share),
            // которые шлют только id/рубрику. Включать осознанно + с маскированием.
            autocapture: false,
            disable_session_recording: true, // 152-ФЗ: не пишем экран пользователя
            disable_surveys: true,
          });
        }
        return posthog;
      })
      .catch(() => null);
  }
  return ready;
}

type TgWebApp = {
  platform?: string;
  version?: string;
  initDataUnsafe?: { user?: { id?: number } };
};

function telegramWebApp(): TgWebApp | undefined {
  return (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
}

/** Инициализирует PostHog (без события). Безопасно звать многократно. */
export function bootAnalytics(): void {
  void ensure();
}

/** distinct_id = tg:<id> — псевдоним, без имени/username (PII, 152-ФЗ). */
export function identifyTelegramUser(): void {
  void ensure().then((ph) => {
    if (!ph) return;
    const id = telegramWebApp()?.initDataUnsafe?.user?.id;
    if (id != null) ph.identify(`tg:${id}`);
  });
}

/** Произвольное событие. props — без ПДн (id статьи/рубрика/платформа — ок). */
export function track(event: string, props?: Record<string, unknown>): void {
  void ensure().then((ph) => ph?.capture(event, props));
}

/** $pageview — вручную на смену маршрута (capture_pageview=false). */
export function trackPageview(): void {
  void ensure().then((ph) => ph?.capture("$pageview"));
}

/** app_open с платформой Telegram (ios/android/tdesktop) — DAU + срез по платформе. */
export function trackAppOpen(): void {
  void ensure().then((ph) => {
    if (!ph) return;
    const tg = telegramWebApp();
    ph.capture("app_open", {
      tg_platform: tg?.platform ?? "unknown",
      tg_version: tg?.version ?? null,
    });
  });
}
