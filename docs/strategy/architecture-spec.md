# X10 Architecture — actual state vs original spec

> Этот файл — **источник истины по архитектуре** (M0+). PDF `X10ArchitectureSpec.pdf` сохранён в `docs/strategy/`, но **отражает раннюю редакцию (CF Workers + Neon + Zero + Vercel)** и больше не соответствует коду. При расхождениях верь этому файлу и коду, не PDF.

Версия: 1.0 · 28 мая 2026 · после M0 deploy prep.

## 1. Стек как он есть

| Слой | Реальность | Что было в исходной спеке |
|---|---|---|
| Rendering | Next.js 16 + `cacheComponents` + `reactCompiler`, **`output: "standalone"`** для prod Docker | Next.js 16 + PPR + Vercel Fluid Compute |
| API | Hono v4 **on Node** (`@hono/node-server`) в Docker | Hono v4 на Cloudflare Workers |
| БД | **Managed PostgreSQL Timeweb DBaaS (Москва)**, pg.Pool через `drizzle-orm/node-postgres` | Neon Postgres Frankfurt + Hyperdrive |
| Sync engine | **Дропнут.** Type-2 server-authoritative (Server Components + Server Actions + TanStack Query + `useOptimistic`). | Zero (Rocicorp) для клампских чатов |
| Vector | pgvector в managed PG, миграция `0000_core.sql:1` `CREATE EXTENSION vector` | Так же |
| Workers | Hono on Node в Docker, Inngest **self-host** v1 (prod без `--dev`, persist в managed PG, схема `inngest`) | Inngest cloud + CF Workers cron |
| AI | Timeweb AI Gateway (OpenAI-совместимый), `AI_GATEWAY_BASE_URL` + `AI_GATEWAY_API_KEY` | Anthropic API direct + ZDR contract |
| Storage | Timeweb S3-compatible (`@aws-sdk/client-s3`, `forcePathStyle: true`) | Cloudflare R2 |
| Voice | ElevenLabs через WS-proxy на Render — **не реализовано** | Так же |
| Cache / rate limit | Redis 8 (self-host в docker-compose на M0, managed Timeweb DBaaS post-M0) + ioredis | CF Workers RateLimit binding |
| Reverse proxy / TLS | **Caddy 2** перед стеком, auto-TLS Let's Encrypt, 3 сабдомена | Vercel edge |
| Hosting | **Один Timeweb Cloud Server (VM) + Docker Compose** | Multi-region edge |
| Auth | Telegram session JWT (HIGH-2, HS256) | Так же |
| Compliance | Timeweb DPA покрывает 152-ФЗ; Masker опциональный, ZDR не нужен при Gateway | Anthropic ZDR contract + KikuAI Masker required |

## 2. Decisions log — что изменилось и почему

| Решение | Когда | Почему |
|---|---|---|
| CF Workers → Hono on Node + Docker | S15 (28 мая 2026) | Уход с CF, переезд на Timeweb (РФ-инфра, 152-ФЗ через DPA). |
| R2 → Timeweb S3 | S16 | Та же причина. |
| Anthropic SDK → OpenAI SDK через Timeweb AI Gateway | S17 | Gateway — OpenAI-compat, общий доступ к Claude/GPT/Gemini через один прокси. |
| Inngest cloud → Inngest self-host | S18 | Privacy + независимость от CDN-блокировок. |
| Neon → Managed Timeweb DBaaS | M0 (28 мая 2026) | РФ-инфра. |
| Zero (Rocicorp) → дропнут | M0 | Type-2 server-authoritative проще для редакторского CMS + B2 pipeline. Sync engine не нужен для текущих UX-сценариев. |
| `ingest` — workspace library, не отдельный worker | ТЗ #1 (Walking Skeleton) | Один Inngest endpoint, cron-функция живёт в pipeline. Не плодим HTTP-процессы. |

## 3. Структура runtime (prod M0)

```
                     ┌─────────────────────┐
                     │  Telegram / Browser │
                     └──────────┬──────────┘
                                │ HTTPS
                                ▼
                     ┌─────────────────────┐
                     │  Caddy 2 (TLS)      │
                     │  api/admin/app .x10.media
                     └──────────┬──────────┘
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
        ┌─────────┐       ┌─────────┐       ┌─────────┐
        │ miniapp │       │  admin  │       │   api   │
        │ Next 16 │       │ Next 16 │       │  Hono   │
        │ :3000   │       │ :3001   │       │  :8080  │
        └────┬────┘       └────┬────┘       └────┬────┘
             │                 │                 │
             └─────────────────┴─────────────────┘
                               │
                ┌──────────────┼──────────────┐
                ▼              ▼              ▼
          ┌─────────┐   ┌──────────┐   ┌──────────┐
          │  Redis  │   │ Inngest  │   │ pipeline │
          │  :6379  │   │  :8288   │   │  :8787   │
          │ (self)  │   │ (self)   │   │  Hono    │
          └─────────┘   └────┬─────┘   └────┬─────┘
                             │              │
                             └──────┬───────┘
                                    ▼
                          ┌──────────────────┐
                          │ Managed Timeweb  │
                          │ PostgreSQL 17    │
                          │ + pgvector       │
                          │ Москва, private  │
                          └──────────────────┘
```

## 4. Pipeline (B2 цепочка) — без изменений

Цепочка `Draft → (Numbers ∥ ToV) → Brevity → [FactCheck if political] → (HookGen ∥ Social ∥ Score ∥ Persist)` остаётся как в `apps/workers/pipeline/src/inngest/functions/draft-article.ts`. После persist эмитится `article.ready` → `post-to-tg` делает реальный sendMessage / sendPhoto (Walking Skeleton, ТЗ #1).

## 5. Что НЕ реализовано (отложено)

- ElevenLabs voice (отдельная задача)
- VisualAgent (NB2) — спека в `packages/voice/visual.md`
- 6 RSS-СМИ кроме vc.ru, TG-каналы клампов (ТЗ #2)
- VK / Дзен / LinkedIn posting (ТЗ #2)
- ScoreAgent feedback loop в `pipeline_config` (ТЗ #3)
- pgvector cosine дедуп — слой 1 (SimHash exact-match) только (ТЗ #3)

## 6. Где про что читать

| Хочешь | Смотри |
|---|---|
| Полный pipeline B2 | [draft-article.ts](../../apps/workers/pipeline/src/inngest/functions/draft-article.ts) |
| Walking Skeleton (ТЗ #1) e2e | [walking-skeleton.e2e.test.ts](../../apps/workers/pipeline/test/walking-skeleton.e2e.test.ts) |
| Schema источников и дедупа | [seen.ts](../../packages/db/src/schema/seen.ts), [sources.ts](../../packages/db/src/schema/sources.ts), [channels.ts](../../packages/db/src/schema/channels.ts) |
| Tone of Voice | [voice.md](../../packages/voice/voice.md) |
| Visual canon | [visual.md](../../packages/voice/visual.md) |
| Prod deploy | [docker-compose.prod.yml](../../docker-compose.prod.yml), [Caddyfile.prod](../../caddy/Caddyfile.prod), [deploy.sh](../../deploy.sh) |
