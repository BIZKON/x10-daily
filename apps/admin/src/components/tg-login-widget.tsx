"use client";

/**
 * Telegram Login Widget (HIGH-2 — admin login flow).
 *
 * Renders <script src="https://telegram.org/js/telegram-widget.js?22">,
 * который рисует фрейм с кнопкой "Log in with Telegram". При успешном
 * логине Telegram вызывает window-функцию (data-onauth), которая получает
 * widget payload и пробрасывает в Server Action loginWithTelegramWidgetAction.
 *
 * Domain должен быть зарегистрирован в @BotFather как login_domain для
 * этого бота — иначе виджет покажет ошибку "Bot domain invalid".
 *
 * NEXT_PUBLIC_TELEGRAM_BOT_USERNAME — без @, например "x10daily_bot".
 */

import { type TelegramWidgetUser, loginWithTelegramWidgetAction } from "@/lib/auth-actions";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

declare global {
  interface Window {
    __x10_tg_auth?: (user: TelegramWidgetUser) => void;
  }
}

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }
  | { kind: "ok" };

export function TgLoginWidget({ botUsername }: { botUsername: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const search = useSearchParams();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!containerRef.current) return;

    window.__x10_tg_auth = (user: TelegramWidgetUser) => {
      startTransition(async () => {
        setStatus({ kind: "submitting" });
        const result = await loginWithTelegramWidgetAction(user);
        if (result.ok) {
          setStatus({ kind: "ok" });
          const next = search.get("next") || "/";
          router.replace(next);
          router.refresh();
          return;
        }
        const message =
          result.reason === "forbidden"
            ? "Недостаточно прав. Доступ к админке открыт только редакторам."
            : result.reason === "tg_invalid"
              ? "Telegram-подпись не прошла верификацию. Перезагрузите страницу."
              : result.reason === "no_backend"
                ? "Backend не доступен (X10_API_BASE_URL не задан)."
                : "Ошибка сети. Попробуйте ещё раз.";
        setStatus({ kind: "error", message });
      });
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "__x10_tg_auth(user)");
    script.setAttribute("data-request-access", "write");
    containerRef.current.appendChild(script);

    return () => {
      delete window.__x10_tg_auth;
      script.remove();
    };
  }, [botUsername, router, search]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div ref={containerRef} className="min-h-[40px]" />
      {status.kind === "submitting" && (
        <p className="text-sm text-muted-foreground">Проверяем подпись…</p>
      )}
      {status.kind === "error" && <p className="text-sm text-destructive">{status.message}</p>}
      {status.kind === "ok" && <p className="text-sm text-success">Готово, перенаправляем…</p>}
    </div>
  );
}
