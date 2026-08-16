"use client";

/**
 * Deep-link из канала (Спека 1). Пост канала несёт url-кнопку
 * `t.me/<bot>?startapp=<slug>`; Telegram открывает Main Mini App по корню `/` и
 * кладёт `<slug>` в `start_param`. Этот компонент читает его при маунте и
 * клиентски роутит на читалку статьи.
 *
 * ⚠️ Читалка `/article/[slug]` живёт ВНЕ группы `(shell)`, а роутер смонтирован
 * в shell-layout → при переходе на статью shell (и роутер) размонтируется.
 * `start_param` при этом статичен всю WebApp-сессию (Telegram его не очищает).
 * Возврат в ленту заново монтирует роутер — инстанс-ref от повторного редиректа
 * НЕ защищает (зацикливает на статье). Поэтому гардим по СЕССИИ: запоминаем
 * обработанный слаг в `sessionStorage` и повторно на него не роутим. Другой
 * слаг (второй deep-link в той же сессии) при этом отработает.
 *
 * Клиентская навигация (`router.replace`) → PPR не затрагивается (рендерит null).
 */

import { routeForStartParam } from "@x10/config";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const HANDLED_SLUG_KEY = "pa_deeplink_slug";

/** Slug статьи — транслит: латиница/цифры/дефис, ≤120. Защита от инъекции пути
 *  (start_param приходит извне; `../`, слэши и т.п. отвергаем). */
export function isValidArticleSlug(s: string): boolean {
  return /^[a-z0-9-]{1,120}$/.test(s);
}

/** start_param из Telegram. Приоритет — SDK (`initDataUnsafe`, он же парсит
 *  hash). Фолбэк — сам hash-фрагмент (Telegram кладёт `tgWebApp*` именно туда,
 *  НЕ в query), и напоследок query — для ручного теста в браузере. */
function readStartParam(): string | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    Telegram?: { WebApp?: { initDataUnsafe?: { start_param?: string } } };
  };
  const fromSdk = w.Telegram?.WebApp?.initDataUnsafe?.start_param;
  if (fromSdk) return fromSdk;
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, "")).get(
    "tgWebAppStartParam",
  );
  if (fromHash) return fromHash;
  return new URLSearchParams(window.location.search).get("tgWebAppStartParam") || null;
}

function sessionGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function sessionSet(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* sessionStorage недоступен — деградируем до инстанс-ref (см. done). */
  }
}

export function StartParamRouter() {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return; // защита от двойного вызова effect (Strict Mode)
    done.current = true;

    const p = readStartParam();
    // Куда вести — решает общая функция: посты канала ведут на статью,
    // ссылка партнёра (`p-<slug>`) — на презентацию продукта.
    const target = routeForStartParam(p);
    if (!p || !target) return;
    // Этот deep-link уже отработан в текущей сессии → не роутим повторно (иначе
    // возврат в ленту выбрасывал бы обратно на статью).
    if (sessionGet(HANDLED_SLUG_KEY) === p) return;
    sessionSet(HANDLED_SLUG_KEY, p);
    router.replace(target);
  }, [router]);

  return null;
}
