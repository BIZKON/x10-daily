# Channel Deep-link Mini App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Каждый пост канала получает inline-кнопку, открывающую Mini App внутри Telegram сразу на этой статье (deep-link через `startapp`); Mini App роутит по `start_param`.

**Architecture:** Пайплайн-постер добавляет `reply_markup` c url-кнопкой `t.me/<bot>?startapp=<slug>` к `sendMessage`/`sendPhoto`. Mini App при старте читает `start_param` и клиентски роутит на `/article/<slug>`. Deep-link URL строит чистый хелпер (тестируемый изолированно).

**Tech Stack:** TypeScript, Hono/Inngest (pipeline), Next.js 16 (miniapp), Vitest, Zod (@x10/config).

## Global Constraints

- Всё по-русски: комменты, коммиты, UI (CLAUDE.md §8).
- TypeScript strict + noUncheckedIndexedAccess; без `any`/`as` без обоснования.
- Новый env воркера → в `@x10/config` Zod-схему + `PipelineBindings` + `readBindingsFromEnv` (`apps/workers/pipeline/src/bindings.ts`) + `docker-compose.prod.yml` + `.env.example` (грабля CLAUDE.md §8).
- PPR-грабля: miniapp-изменения не трогают серверный рендер/`connection()`; роутинг — клиентский.
- Деплой ТОЛЬКО `./deploy.sh`. Push в main — по явному «да» владельца.
- `startapp` допускает `A-Za-z0-9_-`, ≤512 симв. Слаги — транслит (`^[a-z0-9-]+$`), укладываются.

---

### Task 1: Deep-link URL хелпер + bot-username env

**Files:**
- Create: `apps/workers/pipeline/src/lib/miniapp-link.ts`
- Create: `apps/workers/pipeline/test/miniapp-link.test.ts`
- Modify: `packages/config/src/env.ts` (добавить `TELEGRAM_BOT_USERNAME` в схему)
- Modify: `apps/workers/pipeline/src/bindings.ts` (`PipelineBindings` + `readBindingsFromEnv`)
- Modify: `docker-compose.prod.yml` (env сервиса `pipeline`)
- Modify: `.env.example`

**Interfaces:**
- Produces: `buildMiniAppDeepLink(botUsername: string, slug: string): string`

- [ ] **Step 1: Тест хелпера**

```ts
import { describe, expect, it } from "vitest";
import { buildMiniAppDeepLink } from "../src/lib/miniapp-link";

describe("buildMiniAppDeepLink", () => {
  it("строит t.me deep-link со startapp=slug", () => {
    expect(buildMiniAppDeepLink("Sekretar_Syrov_IP_bot", "wms-ii-scheta-za-15-minut")).toBe(
      "https://t.me/Sekretar_Syrov_IP_bot?startapp=wms-ii-scheta-za-15-minut",
    );
  });
  it("обрезает ведущий @ у username", () => {
    expect(buildMiniAppDeepLink("@bot", "a-b")).toBe("https://t.me/bot?startapp=a-b");
  });
});
```

- [ ] **Step 2: Запустить — упадёт (модуля нет)**

Run: `pnpm --filter @x10/pipeline exec vitest run test/miniapp-link.test.ts`
Expected: FAIL (Cannot find module).

- [ ] **Step 3: Реализация хелпера**

```ts
/** Deep-link на Main Mini App бота: `t.me/<bot>?startapp=<slug>`. Тап в канале
 *  открывает Mini App внутри Telegram; slug приходит как start_param (см.
 *  StartParamRouter в miniapp). Слаги — транслит, укладываются в startapp. */
export function buildMiniAppDeepLink(botUsername: string, slug: string): string {
  const bot = botUsername.replace(/^@/, "");
  return `https://t.me/${bot}?startapp=${slug}`;
}
```

- [ ] **Step 4: Тест зелёный**

Run: `pnpm --filter @x10/pipeline exec vitest run test/miniapp-link.test.ts`
Expected: PASS.

- [ ] **Step 5: Env-плумбинг `TELEGRAM_BOT_USERNAME`**

В `packages/config/src/env.ts` рядом с `TELEGRAM_BOT_TOKEN` добавить в схему:

```ts
    TELEGRAM_BOT_USERNAME: z
      .string()
      .regex(/^@?[A-Za-z0-9_]{5,32}$/, "TELEGRAM_BOT_USERNAME — @username бота")
      .optional(),
```

В `apps/workers/pipeline/src/bindings.ts`: в тип `PipelineBindings` добавить
`TELEGRAM_BOT_USERNAME?: string;` (рядом с `TG_TEST_CHANNEL_ID`), и в
`readBindingsFromEnv` — `TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,`.

В `docker-compose.prod.yml` в сервис `pipeline` (`environment:`) добавить:

```yaml
      TELEGRAM_BOT_USERNAME: "${TELEGRAM_BOT_USERNAME:-Sekretar_Syrov_IP_bot}"
```

В `.env.example` добавить строку `TELEGRAM_BOT_USERNAME=Sekretar_Syrov_IP_bot`.

- [ ] **Step 6: typecheck + bindings-тест**

Run: `pnpm --filter @x10/pipeline exec tsc --noEmit && pnpm --filter @x10/pipeline exec vitest run test/bindings.test.ts`
Expected: PASS (если bindings.test ассертит форму — дополнить полем).

- [ ] **Step 7: Commit**

```bash
git add apps/workers/pipeline/src/lib/miniapp-link.ts apps/workers/pipeline/test/miniapp-link.test.ts packages/config/src/env.ts apps/workers/pipeline/src/bindings.ts docker-compose.prod.yml .env.example
git commit -m "feat(pipeline): deep-link хелпер Mini App + TELEGRAM_BOT_USERNAME env"
```

---

### Task 2: Deep-link кнопка в посте канала

**Files:**
- Modify: `apps/workers/pipeline/src/lib/telegram-html.ts` (URL ссылки → deep-link)
- Modify: `apps/workers/pipeline/src/lib/post-channel.ts` (`reply_markup` кнопка)
- Modify: `apps/workers/pipeline/src/inngest/functions/drain-post-slots.ts` (прокинуть botUsername/slug)
- Test: `apps/workers/pipeline/test/post-channel.test.ts` (или telegram-html.test.ts)

**Interfaces:**
- Consumes: `buildMiniAppDeepLink` (Task 1); `SendInput` (`post-channel.ts`).
- Produces: `SendInput` расширяется полем `deepLinkUrl?: string`; при наличии — `reply_markup` inline url-кнопка «Открыть в ProAgent AI».

- [ ] **Step 1: Тест — reply_markup c url-кнопкой**

В `apps/workers/pipeline/test/post-channel.test.ts` добавить кейс: `sendToChannel`
для tg с `deepLinkUrl` кладёт в body `reply_markup.inline_keyboard[0][0]` с
`{ text: "Открыть в ProAgent AI", url: deepLinkUrl }`. Проверять через
`fetchImpl`-мок (перехват тела запроса), как в существующих кейсах файла.

```ts
it("tg: deepLinkUrl → reply_markup c url-кнопкой", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
  }) as unknown as typeof fetch;
  await sendToChannel(ENV, {
    channel: "tg", articleId: "a1", text: "T", visualRef: null, html: null,
    deepLinkUrl: "https://t.me/bot?startapp=my-slug",
  }, { fetchImpl });
  const body = calls[0]!.body as { reply_markup?: { inline_keyboard: Array<Array<{ text: string; url: string }>> } };
  expect(body.reply_markup!.inline_keyboard[0]![0]).toEqual({
    text: "Открыть в ProAgent AI", url: "https://t.me/bot?startapp=my-slug",
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `pnpm --filter @x10/pipeline exec vitest run test/post-channel.test.ts`
Expected: FAIL (поля `deepLinkUrl`/reply_markup нет).

- [ ] **Step 3: Реализация в `post-channel.ts`**

В `SendInput` добавить `deepLinkUrl?: string | null;`. В ветке `channel === "tg"`
построить `reply_markup` при наличии `deepLinkUrl` и прокинуть в ОБА пути
(`html`-sendMessage и обычный sendMessage/sendPhoto):

```ts
    const replyMarkup = input.deepLinkUrl
      ? { inline_keyboard: [[{ text: "Открыть в ProAgent AI", url: input.deepLinkUrl }]] }
      : undefined;
```

В `html`-ветке: `{ chat_id, text: input.html, parse_mode: "HTML", ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }`.
В обычной ветке — то же самое в оба `body` (photo/text). (Telegram кладёт
`reply_markup` в JSON body — callTelegram уже сериализует весь body.)

- [ ] **Step 4: Тест зелёный**

Run: `pnpm --filter @x10/pipeline exec vitest run test/post-channel.test.ts`
Expected: PASS.

- [ ] **Step 5: Прокинуть deepLinkUrl из drain-post-slots + сменить текст-ссылку**

В `drain-post-slots.ts` там, где строится `sendToChannel(...)`-вход: получить
`slug` статьи (уже селектится для html; если нет — добавить в select), собрать
`const deepLinkUrl = env.TELEGRAM_BOT_USERNAME ? buildMiniAppDeepLink(env.TELEGRAM_BOT_USERNAME, slug) : null;`
и передать в `SendInput.deepLinkUrl`.

В `telegram-html.ts` `articleToTelegramHtml`: параметр расширить — принимать
готовый deep-link (или botUsername) и в строке «Читать» использовать deep-link
вместо `${baseUrl}/article/${slug}`. Сигнатуру menять минимально:
`articleToTelegramHtml(article, baseUrl, deepLinkUrl?)` — если `deepLinkUrl` задан,
ссылка ведёт на него; иначе прежний web-URL (обратная совместимость тестов).

- [ ] **Step 6: typecheck + весь pipeline-тест**

Run: `pnpm --filter @x10/pipeline exec tsc --noEmit && pnpm --filter @x10/pipeline test`
Expected: PASS (обновить существующие telegram-html/drain-post-slots тесты под новую сигнатуру, если ассертят URL).

- [ ] **Step 7: Commit**

```bash
git add apps/workers/pipeline/src
git commit -m "feat(pipeline): inline deep-link кнопка «Открыть в ProAgent AI» в посте канала"
```

---

### Task 3: Роутинг Mini App по start_param

**Files:**
- Create: `apps/miniapp/src/components/start-param-router.tsx`
- Modify: `apps/miniapp/src/app/(shell)/layout.tsx` (смонтировать роутер) — или root layout, где есть client-boundary
- Test: `apps/miniapp/test/start-param.test.ts` (чистый валидатор slug)

**Interfaces:**
- Produces: `isValidArticleSlug(s: string): boolean`; `<StartParamRouter/>` — клиентский, при маунте читает `start_param` и `router.replace('/article/'+slug)`.

- [ ] **Step 1: Тест валидатора slug**

```ts
import { describe, expect, it } from "vitest";
import { isValidArticleSlug } from "../src/components/start-param-router";

describe("isValidArticleSlug", () => {
  it("принимает транслит-слаг", () => {
    expect(isValidArticleSlug("wms-ii-scheta-za-15-minut")).toBe(true);
  });
  it("отвергает пустой/спецсимволы/слишком длинный", () => {
    expect(isValidArticleSlug("")).toBe(false);
    expect(isValidArticleSlug("../x")).toBe(false);
    expect(isValidArticleSlug("a".repeat(121))).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `pnpm --filter @x10/miniapp exec vitest run test/start-param.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализация компонента + валидатора**

```tsx
"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Slug статьи — транслит, латиница/цифры/дефис, ≤120. Защита от инъекции пути. */
export function isValidArticleSlug(s: string): boolean {
  return /^[a-z0-9-]{1,120}$/.test(s);
}

function readStartParam(): string | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { start_param?: string } } } };
  const fromSdk = w.Telegram?.WebApp?.initDataUnsafe?.start_param;
  if (fromSdk) return fromSdk;
  const fromUrl = new URLSearchParams(window.location.search).get("tgWebAppStartParam");
  return fromUrl || null;
}

/** Открывает читалку статьи, если Mini App запущен по deep-link из канала
 *  (t.me/<bot>?startapp=<slug>). Клиентская навигация → PPR не затрагивается. */
export function StartParamRouter() {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const p = readStartParam();
    if (p && isValidArticleSlug(p)) router.replace(`/article/${p}`);
  }, [router]);
  return null;
}
```

- [ ] **Step 4: Тест зелёный**

Run: `pnpm --filter @x10/miniapp exec vitest run test/start-param.test.ts`
Expected: PASS.

- [ ] **Step 5: Смонтировать роутер**

В `apps/miniapp/src/app/(shell)/layout.tsx` (клиентская граница уже есть у shell)
отрендерить `<StartParamRouter/>` рядом с контентом. Если shell-layout серверный —
монтировать в существующий client-компонент shell или добавить импорт в
`TelegramProvider` (он `"use client"`), вызвав роутер-эффект там же. Выбрать точку
с гарантированным client-контекстом; НЕ ломать PPR (компонент рендерит `null`).

- [ ] **Step 6: build miniapp — PPR цел**

Run: `pnpm --filter @x10/miniapp build`
Expected: PASS; `/` и `/article/[slug]` остаются `◐ PPR` (мок не запекается).

- [ ] **Step 7: Commit**

```bash
git add apps/miniapp/src apps/miniapp/test
git commit -m "feat(miniapp): роутинг по start_param — deep-link из канала открывает статью"
```

---

## Self-Review

- **Spec coverage:** Компонент A (постинг/кнопка) → Task 1+2; Компонент B (роутинг) → Task 3; env → Task 1; текст-ссылка-фолбэк → Task 2 Step 5; краевые случаи (пустой/невалидный start_param) → Task 3 тест. Ручной BotFather-шаг — вне кода (в спеке). ✓
- **Placeholder scan:** код приведён во всех code-шагах; Task 3 Step 5 оставляет выбор точки монтирования — это реальная развилка от структуры shell-layout, разрешается при исполнении чтением файла (не placeholder логики). ✓
- **Type consistency:** `buildMiniAppDeepLink` (Task 1) ↔ используется Task 2 Step 5; `SendInput.deepLinkUrl` (Task 2) согласован; `isValidArticleSlug` (Task 3) ↔ тест. ✓

## Live-verify (после всех тасков, перед деплоем)

- Adversarial Workflow-ревью диффа (живой контур постинга — обязательно).
- `./deploy.sh` по «да» владельца; пост в тест-канал → кнопка открывает Mini App на статье (требует BotFather Main Mini App — шаг владельца).
