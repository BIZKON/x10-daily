# Handoff · Session 8

**Дата:** 26 мая 2026
**Что закрыто:** Layer 1 → Layer 4b (фундамент + AI-пайплайн до persist)
**Репозиторий:** https://github.com/BIZKON/x10-daily
**HEAD:** `5920dc0` (`origin/main`)

---

## Коммиты сессии (7)

```
5920dc0 feat(layer-4b): Inngest workflow — apps/workers/pipeline + POST /v1/pipeline/run
007fec1 feat(layer-4a): @x10/agents foundation + Draft/Numbers/ToV agents
f677bca feat(miniapp): port interactive prototype — 5 tabs + rich article view
91a64a7 fix(layer-3): Tailwind v4 token utilities + @source for @x10/ui
dc195b2 feat(layer-3): apps/miniapp — Next.js 16 + Cache Components + PPR
f60a586 feat(layer-2): apps/api — Hono v4 on Cloudflare Workers
ee6d319 feat(layer-1): @x10/config + @x10/db + @x10/ui foundation
```

---

## Что работает (проверено)

### 1. Монорепо

5 пакетов в `packages/` (config / db / ui / voice / agents), 4 приложения в `apps/`
(api / miniapp / admin-стаб / workers/pipeline). Все типизированы strict, tsc чисто.

### 2. `@x10/config` + `@x10/db`

- Zod env-loader (152-ФЗ guard в prod: требует `ANTHROPIC_API_KEY` + `MASKER_*` +
  `INNGEST_*`)
- Drizzle schema под Neon — 8 таблиц, миграция `0000_core.sql` с pgvector + pgcrypto

### 3. `@x10/ui` (Tailwind v4)

Дизайн-токены в `theme.css` под прототип:
`--color-red #e63946`, `--color-gold #d4a24c`, `--color-steel #1f2937`,
`--color-night #0b0b0e`, `--color-card #16161b`, `--color-fence #26262c`,
`--color-paper #f2f2f2`, `--color-mist #a0a0a8`, `--color-haze #6b6b73`,
`--color-red-deep #8e1b26`, `--color-success #3fb950`.

**Важно** (зафиксировано в коммите `91a64a7`):
- Используем **сгенерированные утилиты** (`bg-red`, `text-gold`, `rounded-pill`),
  **не** `bg-[var(--color-red)]` — Tailwind v4 + Turbopack не детектят
  arbitrary-value через scanner. См. фикс в `91a64a7`.
- В `apps/miniapp/src/app/globals.css` стоит
  `@source "../../../../packages/ui/src/**/*.{ts,tsx}"` — без этого Tailwind
  не сканирует workspace.

### 4. `apps/api` (Hono v4 на CF Workers)

Роуты: `/health`, `/v1/feed/daily`, `/v1/articles/:slug`, `/v1/pipeline/run`.
Vitest-pool-workers с `cloudflare:test`. Hyperdrive плейсхолдер в `wrangler.toml`.

### 5. `apps/miniapp` (Next.js 16 + Cache Components + PPR)

5-табное приложение по прототипу из `Downloads/x10_news_mini_app_interactive_prototype.html`:
- **Лента** (`/`) — CategoryChips + HeroDigest + FeedCard'ы с HOT/PREMIUM
- **Налоги** (`/taxes`) — рубрика-hero с метриками + Gold-карточка «Гид Х10»
- **Видео** (`/video`) — Podcast-of-week с волновой шкалой + LIVE-pulse
- **Х10** (`/community`) — 30 885 счётчик, кламп с прогресс-баром, события
- **Я** (`/profile`) — stats grid, weekly streak, toggle'ы подписок
- **Статья** (`/article/[slug]`) — hero с play, callout, pull-quote, реакции

Структура: `app/(shell)/` route-group с layout, содержащим TopBar + BottomNav.
Статья вне shell-группы — BottomNav скрыт.

Сборка: `Cache Components enabled`, статика для `/`, `◐ Partial Prerender` для `/article/[slug]`.

### 6. `@x10/voice`

`VOICE_RULES` + `ABOUT_ME` + `BLACKLIST` (30 терминов) + `loadAuthorVoice(name)`.

### 7. `@x10/agents` (Layer 4a)

- `defineAgent<I,O>`: Anthropic SDK + tool_use + Zod schemas + cache_control ephemeral
- `calculateCostUsd` с учётом cached input × 0.1
- `createMasker`: dev pass-through / prod fail-closed (152-ФЗ)
- `zodToToolSchema`: минимальный Zod → JSON Schema
- 3 агента: `DraftAgent` (Sonnet), `NumbersAgent` (Haiku), `ToVAgent` (Sonnet)
- 14 vitest тестов с моком Anthropic-клиента

### 8. `apps/workers/pipeline` (Layer 4b)

- Inngest v4 workflow: `article/topic.ingested` → `DRAFT` → `(NUMBERS ∥ TOV)` → `PERSIST`
- `persistArticle`: транслит slug, word count, insert в `articles` со статусом `ready`
- `apps/api`: `POST /v1/pipeline/run` отправляет Inngest event
- 9 vitest тестов (persist + draft-article orchestration)

---

## Не работает / открытые задачи

### Перед первым реальным LLM-вызовом

1. **Anthropic ZDR-контракт** — подписать у Anthropic до первого вызова из prod
   (CLAUDE.md §7). Иначе input/output логируются 30 дней — нарушение 152-ФЗ.
2. **KikuAI Masker** — развернуть на Render.com (см. skill `anthropic-skills:masker-pii-redaction`).
   Без `MASKER_BASE_URL` + `MASKER_API_KEY` `loadEnv` бросит в prod.
3. **Inngest cloud** — зарегистрироваться, получить `INNGEST_EVENT_KEY` +
   `INNGEST_SIGNING_KEY`. Для локального dev — `npx inngest-cli@latest dev` без ключей.

### Locally to test full pipeline

```bash
# Terminal 1 — pipeline worker
pnpm -F @x10/worker-pipeline dev          # wrangler dev :8787

# Terminal 2 — Inngest dev server (discovers pipeline /inngest endpoint)
pnpm -F @x10/worker-pipeline inngest:dev  # :8288 UI

# Terminal 3 — api (на другой порт, иначе конфликт с pipeline)
cd apps/api && pnpm wrangler dev --port 8788

# Terminal 4 — miniapp фронт
pnpm -F @x10/miniapp dev                   # :3000

# Trigger pipeline:
curl -X POST http://localhost:8788/v1/pipeline/run \
  -H 'content-type: application/json' \
  -d '{
    "topic": "ЦБ ставка",
    "context": "Заседание ЦБ 26 мая",
    "sources": [{"url":"https://cbr.ru/","title":"...","publisher":"ЦБ РФ"}]
  }'
```

Без `ANTHROPIC_API_KEY` агенты упадут — pipeline бросит на `step.run("draft")`.

---

## Что дальше (Layer 5 — план для следующей сессии)

### 5a. Остальные агенты пайплайна (CLAUDE.md §4)

В порядке приоритета:
1. **BrevityAgent** (Sonnet) — сжимает до ≤300 слов / 25-30 сек чтения. После ToV.
2. **HookGenAgent** (Haiku) — 6 паттернов хуков для соцсетей (number-led/contrarian/...).
3. **SocialAmplifyAgent** (Sonnet) — конвертирует в TG/VK/Дзен/LinkedIn под voice канала.
4. **IngestAgent** (Haiku) — парсит ~200 RSS/API источников 06:00 МСК cron.
5. **NewsletterAssembleAgent** (Sonnet) — daily-выпуск в Resend в 06:00 МСК.
6. **ScoreAgent** (Sonnet) — weekly, парсит engagement → обновляет `pipeline_config`.
7. **AudioAgent** (ElevenLabs proxy) — опциональная аудио-версия.
8. **VisualAgent** (Gemini 2.5 Flash proxy) — инфографика для viral-friendly.
9. **FactCheckAgent** (Opus 4.7) — только политические темы, cross-source verification.
10. **HumanGate** — UI в `apps/admin` (ещё не существует), кнопка Publish.

### 5b. Расширение workflow

- Добавить `step.run("brevity")` после ToV
- Добавить `step.run("hookgen")` параллельно с persist
- Добавить cron-функцию `article/daily.cron` для IngestAgent в 06:00 МСК
- Добавить webhook от ScoreAgent → PostHog events

### 5c. apps/admin

CLAUDE.md §3 требует `apps/admin` (Next.js 16 SaaS dashboard) для редколлегии:
- HumanGate UI: список `pipeline_runs` со статусом ready → кнопка Publish
- Editor (Tiptap + Yjs collaborative) для правки draft перед publish
- Просмотр стоимости pipeline по агентам / дням / тиру моделей
- Управление `sources` и `pipeline_config`

### 5d. miniapp → реальные данные

Сейчас лента из mock'а в `apps/miniapp/src/lib/feed.ts`. Переключить на:
```ts
const res = await fetch(`${API_BASE}/v1/feed/daily?limit=20`, { next: { revalidate: 900 } });
```

---

## Тесты

23 зелёных:
- `@x10/agents` — 14 (cost / masker / agents с моком Anthropic)
- `@x10/worker-pipeline` — 9 (persist helpers + draft-article orchestration)

CI не настроен — следующая сессия может добавить GitHub Actions workflow.

---

## Стек 2026 — что использовано

| Зафиксировано в CLAUDE.md | Реализовано |
|---|---|
| Next.js 16 + Cache Components | ✅ |
| Hono v4 + Cloudflare Workers | ✅ |
| Neon + Drizzle | ✅ (Hyperdrive плейсхолдер) |
| Tailwind v4 CSS-first | ✅ |
| Claude Sonnet/Haiku/Opus | ✅ модели в `MODELS` константах, агенты выбирают tier |
| KikuAI Masker | ✅ middleware (без реального deployment) |
| Inngest (workflow) | ✅ v4 с eventType() schemas |
| Telegram Mini App SDK 7.x | 📦 установлено, не использовано |
| ElevenLabs / Resend / OneSignal | ⏳ Layer 5+ |
| PostHog / Sentry | ⏳ Layer 5+ |
| pgvector RAG | ✅ схема создана, агента «Спроси Х10» нет |

---

## Стартовый промпт для новой сессии

> Прочитай `docs/handoffs/handoff-session-8.md` — продолжаем после Layer 4b.
> Сначала Layer 5a: BrevityAgent (Sonnet) + HookGenAgent (Haiku) + добавление
> их в workflow `draft-article`. По CLAUDE.md §4. Перед pnpm install
> жди подтверждения. Покажи план списком задач.
