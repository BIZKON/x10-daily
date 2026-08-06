"use client";

import { loginWithInitDataAction } from "@/lib/auth-actions";
import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Вход, когда кабинет открыт как Mini App внутри Telegram (Спека 4, шаг 6).
 *
 * Login Widget внутри Telegram не работает — там приходит `initData`,
 * подписанная бот-токеном. Компонент подключает SDK, забирает initData и
 * логинит молча: человек уже вошёл в Telegram, второй раз спрашивать нечего.
 *
 * Вне Telegram (обычный браузер) `initData` пуста — компонент ничего не делает
 * и уступает место кнопке виджета.
 */

declare global {
  interface Window {
    Telegram?: { WebApp?: { initData?: string; ready?: () => void; expand?: () => void } };
  }
}

type State = { kind: "idle" } | { kind: "working" } | { kind: "error"; message: string };

export function TgMiniAppLogin() {
  const router = useRouter();
  const search = useSearchParams();
  const [state, setState] = useState<State>({ kind: "idle" });
  // Вход строго один раз: SDK грузится асинхронно, и без этого флага эффект
  // успевал бы отправить две одинаковые попытки.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;

    const tryLogin = () => {
      const initData = window.Telegram?.WebApp?.initData ?? "";
      if (!initData) return false;
      started.current = true;
      window.Telegram?.WebApp?.ready?.();
      window.Telegram?.WebApp?.expand?.();
      setState({ kind: "working" });
      void (async () => {
        const res = await loginWithInitDataAction(initData);
        if (res.ok) {
          router.replace(search.get("next") || "/");
          router.refresh();
          return;
        }
        setState({
          kind: "error",
          message:
            res.reason === "forbidden"
              ? "Этот Telegram-аккаунт не в команде. Попросите владельца прислать приглашение."
              : res.reason === "tg_invalid"
                ? "Telegram не подтвердил вход. Закройте и откройте приложение заново."
                : "Не удалось связаться с сервером. Попробуйте ещё раз.",
        });
      })();
      return true;
    };

    // SDK мог быть уже загружен (возврат на страницу) — тогда скрипт не нужен.
    if (tryLogin()) return;

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    script.onload = () => tryLogin();
    document.head.appendChild(script);
  }, [router, search]);

  if (state.kind === "idle") return null;

  return (
    <div className="w-full">
      {state.kind === "working" ? (
        <div className="flex items-center justify-center gap-2 text-[13px] text-mist">
          <Loader2 size={14} strokeWidth={2} className="animate-spin" /> Входим через Telegram…
        </div>
      ) : (
        <div className="rounded-lg border border-red/40 bg-red/[0.06] px-3 py-2 text-[13px] leading-[1.5] text-red">
          {state.message}
        </div>
      )}
    </div>
  );
}
