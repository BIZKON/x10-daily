/**
 * Admin login page (HIGH-2).
 *
 * Точка входа для редколлегии. Два пути:
 * 1. Production / staging: Telegram Login Widget — кликаем "Log in with Telegram",
 *    подпись верифицируется в /v1/auth/telegram-widget (тот же BOT_TOKEN
 *    что и Mini App). Только role editor|admin могут войти.
 * 2. Development: form с кнопкой "Dev login" если задан X10_ADMIN_USER_ID env.
 *    Создаёт сессию через /v1/auth/dev-login.
 *
 * 3. Внутри Telegram (Mini App, Спека 4 шаг 6): Login Widget там не работает —
 *    приходит initData, и вход происходит молча (TgMiniAppLogin).
 *
 * Bot username должен быть прописан в NEXT_PUBLIC_TELEGRAM_BOT_USERNAME env.
 */

import { TgLoginWidget } from "@/components/tg-login-widget";
import { TgMiniAppLogin } from "@/components/tg-miniapp-login";
import { devLoginAction } from "@/lib/auth-actions";
import { getSessionToken } from "@/lib/session";
import { redirect } from "next/navigation";
import { Suspense } from "react";

// Cache Components (Next 16): async (searchParams + cookie read) ДОЛЖНО быть
// внутри <Suspense>, иначе prerender падает «Uncached data outside Suspense».
export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}

function LoginSkeleton() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="h-72 w-full max-w-sm animate-pulse rounded-2xl bg-card" />
    </div>
  );
}

async function LoginContent({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next ?? "/";

  // Если уже авторизованы — редирект сразу на next.
  const existing = await getSessionToken();
  if (existing) redirect(next);

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim();
  const isDev = process.env.NODE_ENV !== "production";
  const devEnabled = isDev && Boolean(process.env.X10_ADMIN_USER_ID?.trim());

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight">Кабинет ProAgent AI</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Вход по Telegram — тому же аккаунту, которым вас пригласили в команду
          </p>
        </div>

        {/* Внутри Telegram (Mini App) входим молча по initData: человек уже
            вошёл в Telegram, спрашивать второй раз нечего. Вне Telegram
            компонент ничего не рисует и уступает место кнопке виджета. */}
        <TgMiniAppLogin />

        {botUsername ? (
          <TgLoginWidget botUsername={botUsername} />
        ) : (
          <div className="rounded-lg border border-red/40 bg-red/[0.06] px-4 py-3 text-[13px] leading-[1.55] text-red">
            Кабинет не настроен на вход через Telegram. Сообщите администратору.
          </div>
        )}

        {devEnabled && (
          <form
            action={async () => {
              "use server";
              const result = await devLoginAction();
              if (result.ok) redirect(next);
            }}
            className="mt-6 border-t border-border pt-6"
          >
            <p className="mb-3 text-xs text-muted-foreground">
              Dev-режим: вход по <code>X10_ADMIN_USER_ID</code> env (без TG WebView).
            </p>
            <button
              type="submit"
              className="w-full rounded-md border border-border bg-background py-2 text-sm font-medium hover:bg-muted"
            >
              Войти как dev-admin
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
