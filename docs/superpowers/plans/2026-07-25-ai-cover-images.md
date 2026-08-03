# ИИ-обложки статей (Nano Banana 2) — Implementation Plan

> ✅ **ИСПОЛНЕН в сессии 30 (03.08.2026).** Task 0-7 сделаны. Отклонения от плана,
> принятые при исполнении (каждое с обоснованием в коде):
> 1. **Промпт VisualAgent строится по канону `packages/voice/visual.md`**, а не по
>    черновику ниже: черновик просил `subtle glow` и тёмный charcoal-фон, что канон
>    прямо запрещает («не использует неон, киберпанк, AI-свечение»). Порядок блоков —
>    STYLE → PILLAR → SUBJECT → NEGATIVE → TECH.
> 2. **Генерация и запись — ОДИН Inngest-шаг** (в плане были `generate` и `store`
>    раздельно): Inngest сериализует результаты `step.run` в JSON, и ~450-800 КБ байтов
>    картинки через границу шага распухли бы в `{"0":255,…}`.
> 3. **URL обложки несёт версию содержимого** (`?v=<хеш байтов>`): имя файла
>    детерминировано по articleId, перегенерация перезаписывает тот же путь, и
>    `immutable`+1год из плана залипил бы старую картинку навсегда.
> 4. **Экран админки — `/visuals`**, а не `(dash)/visuals` (такой группы маршрутов в
>    админке нет), + `connection()` внутри Suspense (иначе билд запекал fallback).
> 5. **Плюс к плану:** гейт `visual_status` в API ленты — без него отклонённая
>    редактором картинка всё равно показывалась бы в ленте (дыра в HumanGate).

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development или superpowers:executing-plans. Шаги — чекбоксы (`- [ ]`).

**Goal:** Каждая новая статья получает сгенерированную редакционную иллюстрацию; она становится обложкой в ленте Mini App и крупным фото в посте канала. Публикация картинки — после ревью редактора в админке.

**Architecture:** Inngest-шаг после доведения статьи → VisualAgent (DeepSeek через Timeweb-шлюз) крафтит промпт → генерация `gemini/gemini-3.1-flash-image-preview` через тот же шлюз → JPEG на диск прод-VM (раздаёт Caddy) → `coverImageUrl` + `visualStatus='pending_review'` → редактор одобряет в админке → `drain-post-slots` шлёт `sendPhoto`. Любой сбой/неодобрение → текстовый пост как сейчас.

**Tech Stack:** TypeScript, Inngest, Hono (api), Next.js 16 (admin/miniapp), Drizzle + hand-written миграции, Vitest, Caddy, Docker volume.

## Global Constraints

- Всё по-русски: комменты, коммиты, UI (CLAUDE.md §8).
- Новый env воркера → `@x10/config` Zod + `PipelineBindings` + `readBindingsFromEnv` + `docker-compose.prod.yml` + `.env.example` (грабля §8).
- Миграции ТОЛЬКО hand-written + запись в `packages/db/drizzle/meta/_journal.json`; `db:generate` НЕ запускать. ADD COLUMN обратим.
- HumanGate обязателен: **AI не публикует картинку автономно** — только после одобрения редактора.
- Никаких новых npm-зависимостей без явного согласия владельца (запись картинки — стандартным `node:fs/promises`).
- PPR-грабля: изменения miniapp не трогают `connection()`/Suspense-структуру.
- Деплой только `./deploy.sh`; push в main — по явному «да».
- Фолбэк железный: нет одобренной картинки → текстовый пост (канал не ждёт и не молчит).

## Факты спайка (использовать как есть)

- Модель: `gemini/gemini-3.1-flash-image-preview`, вызов `POST {AI_GATEWAY_BASE_URL}/chat/completions`.
- Ответ: `choices[0].message.images[0].image_url.url` = `data:image/jpeg;base64,…`; `message.content` = `null`.
- Живой прогон: JPEG 1408×768, 802 КБ, `usage.completion_tokens_details.image_tokens = 1120`.

## Структура файлов

- `packages/db/drizzle/0014_article_visual.sql` (+ запись в `meta/_journal.json`) — `visual_status`, `visual_prompt`.
- `packages/agents/src/agents/visual.ts` — VisualAgent (промпт иллюстрации).
- `apps/workers/pipeline/src/lib/gemini-image.ts` — вызов image-модели, разбор data-URL → байты.
- `apps/workers/pipeline/src/lib/cover-storage.ts` — запись файла + публичный URL (абстракция хранилища).
- `apps/workers/pipeline/src/inngest/functions/generate-cover.ts` — оркестрация.
- `apps/api/src/routes/admin-visual.ts` — эндпоинты ревью (approve/reject/regenerate).
- `apps/admin/src/app/(dash)/visuals/page.tsx` — очередь ревью.
- Правки: `drain-post-slots.ts` (ветка sendPhoto), `apps/miniapp` карточки (реальная обложка), `caddy/Caddyfile.prod` (раздача `/covers/*`), `docker-compose.prod.yml` (volume + env).

---

### Task 1: Схема БД + env хранилища

**Files:**
- Create: `packages/db/drizzle/0014_article_visual.sql`
- Modify: `packages/db/drizzle/meta/_journal.json`
- Modify: `packages/db/src/schema/articles.ts`
- Modify: `packages/config/src/env.ts`, `apps/workers/pipeline/src/bindings.ts`, `docker-compose.prod.yml`, `.env.example`
- Test: `apps/workers/pipeline/test/bindings.test.ts`

**Interfaces:**
- Produces: колонки `articles.visual_status` (`none|generating|pending_review|approved|rejected`, default `'none'`), `articles.visual_prompt` (text null); env `COVERS_DIR`, `COVERS_PUBLIC_BASE_URL`.

- [x] **Step 1: Миграция (обратимая, ADD COLUMN — без enum)**

`packages/db/drizzle/0014_article_visual.sql`:

```sql
-- Статус ИИ-обложки статьи. varchar+CHECK (НЕ pg enum) — обратимо и не требует
-- ADD VALUE (грабля s28: drizzle гонит пачку одной транзакцией).
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "visual_status" varchar(20) DEFAULT 'none' NOT NULL;
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "visual_prompt" text;
CREATE INDEX IF NOT EXISTS "articles_visual_status_idx" ON "articles" ("visual_status");
```

В `meta/_journal.json` дописать запись с `idx` на 1 больше последней, `tag: "0014_article_visual"`, `when` — текущий unix-ms.

- [x] **Step 2: Схема Drizzle**

В `packages/db/src/schema/articles.ts` в `articles` добавить:

```ts
  /** Статус ИИ-обложки: none|generating|pending_review|approved|rejected. */
  visualStatus: varchar("visual_status", { length: 20 }).default("none").notNull(),
  /** Промпт иллюстрации (для перегенерации без повторного крафта). */
  visualPrompt: text("visual_prompt"),
```

- [x] **Step 3: Тест env-плумбинга (падающий)**

В `apps/workers/pipeline/test/bindings.test.ts`:

```ts
  it("читает COVERS_* — путь и публичный URL обложек доходят до воркера", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    vi.stubEnv("COVERS_DIR", "/data/covers");
    vi.stubEnv("COVERS_PUBLIC_BASE_URL", "https://app.pro-agent-ai.ru/covers");
    const b = readBindingsFromEnv();
    expect(b.COVERS_DIR).toBe("/data/covers");
    expect(b.COVERS_PUBLIC_BASE_URL).toBe("https://app.pro-agent-ai.ru/covers");
  });
```

Run: `pnpm --filter @x10/worker-pipeline exec vitest run test/bindings.test.ts` → FAIL.

- [x] **Step 4: Env-плумбинг**

`packages/config/src/env.ts` (рядом с прочими опциональными):

```ts
    /** Каталог на диске для сгенерированных обложек (том Docker). Пусто → генерация выключена. */
    COVERS_DIR: z.string().optional(),
    /** Публичный базовый URL раздачи обложек (Caddy). Пусто → генерация выключена. */
    COVERS_PUBLIC_BASE_URL: urlOrEmpty.optional(),
    /** Модель генерации обложек через Timeweb AI Gateway. */
    IMAGE_MODEL: z.string().default("gemini/gemini-3.1-flash-image-preview"),
```

`apps/workers/pipeline/src/bindings.ts`: в интерфейс `COVERS_DIR?: string; COVERS_PUBLIC_BASE_URL?: string; IMAGE_MODEL?: string;`, в `readBindingsFromEnv` — те же три из `process.env`.

`docker-compose.prod.yml` сервис `pipeline`: env
```yaml
      # ИИ-обложки: каталог тома + публичный URL (раздаёт Caddy). Пусто → выкл.
      COVERS_DIR: "${COVERS_DIR:-/data/covers}"
      COVERS_PUBLIC_BASE_URL: "${COVERS_PUBLIC_BASE_URL:-}"
      IMAGE_MODEL: "${IMAGE_MODEL:-gemini/gemini-3.1-flash-image-preview}"
```
и том: в `volumes:` сервиса `pipeline` — `- covers:/data/covers`; в корневой `volumes:` — `covers:`.

`.env.example`: три ключа с комментарием «пусто → генерация обложек выключена».

- [x] **Step 5: Тесты зелёные + typecheck**

Run: `pnpm --filter @x10/worker-pipeline exec vitest run test/bindings.test.ts && pnpm --filter @x10/db exec tsc --noEmit`
Expected: PASS.

- [x] **Step 6: Dry-run миграции на прод-дампе (грабля s28 — обязательно)**

Восстановить свежий дамп в `pgvector/pgvector:pg17` и прогнать `db:migrate`; убедиться `applied successfully` и идемпотентность (повторный прогон без ошибок).

- [x] **Step 7: Commit**

```bash
git add packages/db packages/config apps/workers/pipeline docker-compose.prod.yml .env.example
git commit -m "feat(db): схема ИИ-обложек (visual_status/visual_prompt) + env хранилища"
```

---

### Task 2: VisualAgent — промпт иллюстрации

**Files:**
- Create: `packages/agents/src/agents/visual.ts`
- Modify: `packages/agents/src/index.ts` (экспорт)
- Test: `packages/agents/test/visual.test.ts`

**Interfaces:**
- Produces: `createVisualAgent(deps)` → `run({ tease, lede, category }) => { imagePrompt: string }`; константа `BRAND_STYLE_SUFFIX`.

- [x] **Step 1: Падающий тест**

```ts
import { describe, expect, it } from "vitest";
import { BRAND_STYLE_SUFFIX, buildVisualUserPrompt } from "../src/agents/visual";

describe("VisualAgent", () => {
  it("стилевой суффикс задаёт палитру бренда и запрещает текст на картинке", () => {
    expect(BRAND_STYLE_SUFFIX).toMatch(/#E63946/i);
    expect(BRAND_STYLE_SUFFIX).toMatch(/#D4A24C/i);
    expect(BRAND_STYLE_SUFFIX.toLowerCase()).toContain("no text");
  });
  it("user-промпт несёт суть статьи", () => {
    const p = buildVisualUserPrompt({ tease: "WMS + ИИ: счета за 15 минут", lede: "Автоматизация счетов", category: "cases" });
    expect(p).toContain("WMS + ИИ: счета за 15 минут");
    expect(p).toContain("Автоматизация счетов");
  });
});
```

Run: `pnpm --filter @x10/agents exec vitest run test/visual.test.ts` → FAIL.

- [x] **Step 2: Реализация**

`packages/agents/src/agents/visual.ts` — следовать паттерну соседних агентов (`define-agent`, JSON-выход). Ключевое содержимое:

```ts
/** Стиль бренда для генератора картинок. Текст на изображении ЗАПРЕЩЁН: модели
 *  коверкают буквы (особенно кириллицу) — бренд держим палитрой и композицией. */
export const BRAND_STYLE_SUFFIX =
  "Editorial flat vector illustration, isometric-leaning composition, " +
  "deep charcoal background (#0B0B0E to #1F2937), crimson accent (#E63946), " +
  "gold accent (#D4A24C), clean geometric shapes, subtle glow, business-like, " +
  "no text, no letters, no numbers, no logos, no watermarks, no human faces.";

export function buildVisualUserPrompt(a: { tease: string; lede: string; category: string }): string {
  return [
    `Заголовок статьи: ${a.tease}`,
    `Суть: ${a.lede}`,
    `Рубрика: ${a.category}`,
    "Придумай МЕТАФОРУ для иллюстрации по-английски: что изобразить (объекты, сцена, композиция).",
    "Без текста и букв в кадре. Только описание сцены, 1-2 предложения.",
  ].join("\n");
}
```

Агент возвращает `{ scene: string }`; итоговый `imagePrompt = scene + " " + BRAND_STYLE_SUFFIX`.

- [x] **Step 3: Тесты зелёные**

Run: `pnpm --filter @x10/agents exec vitest run test/visual.test.ts` → PASS.

- [x] **Step 4: Commit**

```bash
git add packages/agents
git commit -m "feat(agents): VisualAgent — промпт редакционной иллюстрации в палитре бренда"
```

---

### Task 3: Клиент image-модели + хранилище на диске

**Files:**
- Create: `apps/workers/pipeline/src/lib/gemini-image.ts`
- Create: `apps/workers/pipeline/src/lib/cover-storage.ts`
- Test: `apps/workers/pipeline/test/gemini-image.test.ts`, `test/cover-storage.test.ts`

**Interfaces:**
- Consumes: env `AI_GATEWAY_BASE_URL`, `AI_GATEWAY_API_KEY`, `IMAGE_MODEL`, `COVERS_DIR`, `COVERS_PUBLIC_BASE_URL`.
- Produces: `generateCoverImage(env, prompt, opts?) => Promise<{ bytes: Uint8Array; mime: string }>`; `saveCover(env, articleId, bytes, mime) => Promise<string /* публичный URL */>`; `parseDataUrl(url) => { mime, bytes }`.

- [x] **Step 1: Падающий тест разбора ответа**

```ts
import { describe, expect, it } from "vitest";
import { extractImageFromResponse, parseDataUrl } from "../src/lib/gemini-image";

describe("gemini-image", () => {
  it("parseDataUrl разбирает data:image/jpeg;base64", () => {
    const r = parseDataUrl("data:image/jpeg;base64,/9j/4AAQ");
    expect(r.mime).toBe("image/jpeg");
    expect(r.bytes.length).toBeGreaterThan(0);
  });
  it("достаёт картинку из message.images (content=null — как отдаёт шлюз)", () => {
    const body = {
      choices: [{ message: { content: null, images: [{ image_url: { url: "data:image/jpeg;base64,/9j/4AAQ" } }] } }],
    };
    const img = extractImageFromResponse(body);
    expect(img.mime).toBe("image/jpeg");
  });
  it("нет картинки → внятная ошибка", () => {
    expect(() => extractImageFromResponse({ choices: [{ message: { content: "текст" } }] })).toThrow(/картинк/i);
  });
});
```

Run: `pnpm --filter @x10/worker-pipeline exec vitest run test/gemini-image.test.ts` → FAIL.

- [x] **Step 2: Реализация клиента**

`gemini-image.ts`: `parseDataUrl`, `extractImageFromResponse` (путь `choices[0].message.images[0].image_url.url`, ⚠️ `content` = null — не использовать), `generateCoverImage` (POST `/chat/completions`, `model: env.IMAGE_MODEL`, per-request timeout 300s как у define-agent, ошибка → throw).

- [x] **Step 3: Падающий тест хранилища**

```ts
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { coverFileName, saveCover } from "../src/lib/cover-storage";

describe("cover-storage", () => {
  it("имя файла детерминировано по articleId и расширению mime", () => {
    expect(coverFileName("a1b2", "image/jpeg")).toBe("a1b2.jpg");
    expect(coverFileName("a1b2", "image/png")).toBe("a1b2.png");
  });
  it("пишет файл и возвращает публичный URL", async () => {
    const dir = await mkdtemp(join(tmpdir(), "covers-"));
    const env = { COVERS_DIR: dir, COVERS_PUBLIC_BASE_URL: "https://app.example.ru/covers" } as never;
    const url = await saveCover(env, "a1", new Uint8Array([1, 2, 3]), "image/jpeg");
    expect(url).toBe("https://app.example.ru/covers/a1.jpg");
    expect((await readFile(join(dir, "a1.jpg"))).length).toBe(3);
  });
});
```

Run → FAIL.

- [x] **Step 4: Реализация хранилища**

`cover-storage.ts` на `node:fs/promises` (`mkdir` recursive + `writeFile`), без новых зависимостей. Докблок: абстракция намеренно узкая (`saveCover`), переезд на S3 = замена тела функции.

- [x] **Step 5: Тесты зелёные + typecheck**

Run: `pnpm --filter @x10/worker-pipeline exec vitest run test/gemini-image.test.ts test/cover-storage.test.ts && pnpm --filter @x10/worker-pipeline exec tsc --noEmit` → PASS.

- [x] **Step 6: Commit**

```bash
git add apps/workers/pipeline
git commit -m "feat(pipeline): клиент image-модели Timeweb-шлюза + хранилище обложек на диске"
```

---

### Task 4: Оркестрация генерации (Inngest)

**Files:**
- Create: `apps/workers/pipeline/src/inngest/functions/generate-cover.ts`
- Modify: `apps/workers/pipeline/src/app.ts` (регистрация функции), `src/events.ts` (событие)
- Test: `apps/workers/pipeline/test/generate-cover.test.ts`

**Interfaces:**
- Consumes: `createVisualAgent`, `generateCoverImage`, `saveCover`.
- Produces: Inngest-функция id `generate-cover`, событие `article/cover.requested` c `{ articleId }`.

- [x] **Step 1: Падающий тест оркестрации**

Мокать `@x10/db` chain-объектом (паттерн `drain-post-slots.test.ts`), мокать генерацию и хранилище. Проверять: (а) happy — пишет `coverImageUrl` + `visualStatus='pending_review'` + `visualPrompt`; (б) генерация бросила → `visualStatus` НЕ становится `pending_review` (остаётся `none`), функция не роняет пайплайн; (в) `COVERS_DIR`/`COVERS_PUBLIC_BASE_URL` пусты → шаг скипается с причиной `covers-disabled`.

- [x] **Step 2: Реализация**

Шаги Inngest: `load-article` → `visual-prompt` (VisualAgent) → `generate` → `store` → `mark-pending-review`. Гард в начале: нет `COVERS_DIR`/`COVERS_PUBLIC_BASE_URL` → `return { skipped: true, reason: "covers-disabled" }`. Ошибка любого шага → пробрасывается (Inngest ретраит `retries: 1`), но `visualStatus` не выставляется в approved.

- [x] **Step 3: Тесты зелёные**

Run: `pnpm --filter @x10/worker-pipeline exec vitest run test/generate-cover.test.ts` → PASS.

- [x] **Step 4: Триггер из пайплайна**

В месте, где статья доведена (после persist, рядом с постановкой в очередь канала), отправить событие `article/cover.requested`. ⚠️ Не блокировать основной поток: отправка события — отдельный шаг, ошибка не роняет публикацию.

- [x] **Step 5: Полный прогон + commit**

Run: `pnpm --filter @x10/worker-pipeline test && pnpm --filter @x10/worker-pipeline exec tsc --noEmit`

```bash
git add apps/workers/pipeline
git commit -m "feat(pipeline): Inngest-функция генерации обложки (generate-cover)"
```

⚠️ **Новый id функции → после деплоя re-sync PUT на pipeline:8787 из контейнера api (НЕ localhost)** — грабля §8.

---

### Task 5: Ревью обложек в админке

**Files:**
- Create: `apps/api/src/routes/admin-visual.ts`
- Modify: `apps/api/src/app.ts` (монтирование)
- Create: `apps/admin/src/app/(dash)/visuals/page.tsx` + компонент карточки ревью
- Test: `apps/api/test/admin-visual.test.ts`

**Interfaces:**
- Produces: `GET /v1/admin/visuals?status=pending_review` (список: id, tease, coverImageUrl, visualPrompt); `POST /v1/admin/visuals/:id/approve`; `POST /v1/admin/visuals/:id/reject`; `POST /v1/admin/visuals/:id/regenerate` (шлёт `article/cover.requested`).

- [x] **Step 1: Падающий тест роутов** — авторизация админа (паттерн существующих admin-роутов), смена `visual_status`, 404 на неизвестный id.
- [x] **Step 2: Реализация роутов** по паттерну `apps/api/src/routes/admin.ts`.
- [x] **Step 3: Тесты зелёные.**
- [x] **Step 4: UI очереди** — список карточек: картинка, заголовок, кнопки «Одобрить»/«Перегенерировать»/«Без картинки». Паттерн существующих экранов админки; тексты по-русски.
- [x] **Step 5: Сборка admin** (`pnpm --filter @x10/admin build`) + commit.

```bash
git commit -m "feat(admin): очередь ревью ИИ-обложек (одобрить/перегенерить/без картинки)"
```

---

### Task 6: Публикация — фото-пост в канал и обложка в ленте

**Files:**
- Modify: `apps/workers/pipeline/src/inngest/functions/drain-post-slots.ts`
- Create: `apps/workers/pipeline/src/lib/caption.ts` (+ тест)
- Modify: карточки miniapp (`feed-card.tsx` / `news-card.tsx` / `deep-dive-card.tsx`) — реальная обложка вместо `BrandedCover`
- Test: `apps/workers/pipeline/test/caption.test.ts`

**Interfaces:**
- Produces: `buildPhotoCaption(article) => string` (≤1024, HTML, обрезка по границе слова + «…»).

- [x] **Step 1: Падающий тест каптиона** — ≤1024; обрезка по слову; заголовок жирным; deep-link-ссылка в конце.
- [x] **Step 2: Реализация `caption.ts`.**
- [x] **Step 3: Ветка постинга.** В `drain-post-slots` селект статьи дополнить `coverImageUrl`, `visualStatus`. Если `visualStatus === "approved"` и есть `coverImageUrl` → `SendInput.visualRef = coverImageUrl`, `text = buildPhotoCaption(...)`, `html = null` (у `sendPhoto` HTML идёт в `caption`, `parse_mode` — отдельным полем: расширить `sendToChannel` для `caption_parse_mode`). Иначе — как сейчас (текстовый пост).
- [x] **Step 4: Тесты + typecheck зелёные.**
- [x] **Step 5: Лента miniapp** — карточки уже ветвятся `imageUrl ? <Image> : <BrandedCover>`; убедиться, что `coverImageUrl` доезжает в `FeedItem.imageUrl` (API `feed/daily` уже отдаёт `coverImageUrl`). Проверить LCP: обложке первого экрана добавить `priority`.
- [x] **Step 6: Сборка miniapp (PPR цел) + commit.**

```bash
git commit -m "feat(pipeline,miniapp): фото-пост в канал + реальная обложка в ленте"
```

---

### Task 7: Инфраструктура раздачи + деплой

**Files:**
- Modify: `caddy/Caddyfile.prod` (раздача `/covers/*`), `docker-compose.prod.yml` (том `covers` также в caddy).

- [x] **Step 1: Caddy.** В блоке `app.{$X10_BASE_DOMAIN}` ДО общего `handle`:

```
	# Сгенерированные обложки статей (том covers, пишет pipeline).
	handle_path /covers/* {
		root * /srv/covers
		header Cache-Control "public, max-age=31536000, immutable"
		file_server
	}
```

Том `covers:/srv/covers:ro` в сервис `caddy`.

- [x] **Step 2: Валидация конфига** — `docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile` ПЕРЕД reload (радиус поражения — TLS всего сайта).
- [x] **Step 3: Задать env на проде** — `COVERS_PUBLIC_BASE_URL=https://app.pro-agent-ai.ru/covers` в `.env.production`.
- [x] **Step 4: Adversarial Workflow-ревью всего диффа** (живой контур постинга + новая внешняя генерация).
- [x] **Step 5: `./deploy.sh` по «да» владельца** → re-sync Inngest (новый id функции) → live-verify: генерация одной статьи, картинка отдаётся по URL 200, очередь ревью в админке, тестовый sendPhoto.

---

## Self-Review

- **Spec coverage:** VisualAgent → Task 2; клиент+хранилище → Task 3; оркестрация → Task 4; ревью в админке → Task 5; постинг+лента → Task 6; схема/env → Task 1; Caddy/деплой → Task 7. Фолбэки — Task 4 (гард) и Task 6 (ветка). ✓
- **Placeholder scan:** код приведён для ключевых шагов; в Task 5/6 UI-шаги описаны через существующие паттерны (файлы названы) — это следование кодовой базе, не placeholder. ✓
- **Type consistency:** `generateCoverImage`/`saveCover`/`coverFileName` (Task 3) ↔ используются Task 4; `visualStatus` (Task 1) ↔ Task 4/5/6; `buildPhotoCaption` (Task 6) ↔ тест. ✓

## Риски и как закрыты

| Риск | Закрытие |
|---|---|
| Картинка не сгенерилась / шлюз недоступен | `visualStatus` не approved → текстовый пост (как сейчас) |
| Редактор не успел одобрить к слоту | текстовый пост; картинка позже служит обложкой в ленте |
| Диск VM растёт | ~4 картинки/день ≈ 100 МБ/мес; следить, при росте — S3 (замена `saveCover`) |
| Ошибка в Caddyfile | `caddy validate` до reload |
| Новый id Inngest-функции | re-sync PUT на pipeline:8787 из api |
| Стоимость | замерить по `pipeline_runs` после первых генераций; при росте — уменьшить частоту |
