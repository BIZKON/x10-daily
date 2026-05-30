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
 * Bot username должен быть прописан в NEXT_PUBLIC_TELEGRAM_BOT_USERNAME env
 * (например "x10daily_bot"). Без него Widget не рендерится — показываем подсказку.
 */

import { redirect } from "next/navigation";
import { Suspense } from "react";
import { devLoginAction } from "@/lib/auth-actions";
import { getSessionToken } from "@/lib/session";
import { TgLoginWidget } from "@/components/tg-login-widget";

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
          <h1 className="font-display text-2xl font-bold tracking-tight">X10 Admin</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            HumanGate · вход для редколлегии
          </p>
        </div>

        {botUsername ? (
          <TgLoginWidget botUsername={botUsername} />
        ) : (
          <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
            <p className="font-medium">Telegram Login Widget не настроен</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Задайте <code className="rounded bg-background px-1">NEXT_PUBLIC_TELEGRAM_BOT_USERNAME</code>
              {" "}и зарегистрируйте домен в @BotFather (см. DEPLOY.md §6.4).
            </p>
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
