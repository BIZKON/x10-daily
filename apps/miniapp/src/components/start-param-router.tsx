"use client";

/**
 * Deep-link из канала (Спека 1). Пост канала несёт url-кнопку
 * `t.me/<bot>?startapp=<slug>`; Telegram открывает Main Mini App по корню `/` и
 * кладёт `<slug>` в `start_param`. Этот компонент читает его при маунте и
 * клиентски роутит на читалку статьи.
 *
 * Клиентская навигация (`router.replace`) → PPR не затрагивается (компонент
 * рендерит null, монтируется в shell-layout — точке входа deep-link).
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** Slug статьи — транслит: латиница/цифры/дефис, ≤120. Защита от инъекции пути
 *  (start_param приходит извне; `../`, слэши и т.п. отвергаем). */
export function isValidArticleSlug(s: string): boolean {
  return /^[a-z0-9-]{1,120}$/.test(s);
}

function readStartParam(): string | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    Telegram?: { WebApp?: { initDataUnsafe?: { start_param?: string } } };
  };
  const fromSdk = w.Telegram?.WebApp?.initDataUnsafe?.start_param;
  if (fromSdk) return fromSdk;
  const fromUrl = new URLSearchParams(window.location.search).get("tgWebAppStartParam");
  return fromUrl || null;
}

export function StartParamRouter() {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const p = readStartParam();
    if (p && isValidArticleSlug(p)) {
      router.replace(`/article/${p}`);
    }
  }, [router]);

  return null;
}
