# Handoff · Session 14 — Timeweb migration + Discovery audit

**Дата:** 28 мая 2026
**Что произошло:** (1) Полная миграция стека Cloudflare/Neon/Vercel → Timeweb Cloud РФ, 7 коммитов кода (S14–S18). (2) Discovery-аудит автономного контура вскрыл **критический gap со спекой**: построен редакторский CMS, **не автономный контур сбора+постинга**.
**Репозиторий:** https://github.com/BIZKON/x10-daily
**HEAD:** `c399c60` (push done, working tree clean).

---

## ⚠️ ГЛАВНЫЙ ВЫВОД СЕССИИ

**Контур НЕ автономен.** Все сессии 1–13 строили **редакторский CMS с AI-обвязкой**, не automation pipeline. Это вскрылось discovery-аудитом в конце session 14. Подробно см. `## 5. Discovery audit`.

Перед продолжением Phase 2 (deploy на Timeweb) **необходимо решить со scope**: достраиваем автономный контур (новая большая работа, ~5+ сессий) или продолжаем как CMS с ручным workflow редколлегии (текущее состояние, готово к deploy после S19).

---

## Git коммиты сессии (7)

```
c399c60  refactor(workers): pipeline → Hono Node + Dockerfile + docker-compose (S18)
b392a0c  refactor(agents): Anthropic SDK → OpenAI SDK для Timeweb AI Gateway (S17)
578a480  feat(config): AI_GATEWAY_* envs — OpenAI-compat proxy через Timeweb
e1516a0  feat(api): Redis rate limiter + S3 ObjectStorage implementations (S16)
73d8b41  refactor(api): Cloudflare Workers → Hono on Node + Dockerfile (S15)
147b9a0  feat(config): ANTHROPIC_BASE_URL + Timeweb model IDs (промежуточный)
fbe251e  refactor(db): neon-http → pg Pool driver для Timeweb DBaaS (S14)
```

Все typecheck-clean + tests passed (33/33 agents + 17/17 pipeline + smoke /health на api и pipeline).

---

## 1. Что сделано — Timeweb migration (S14–S18)

### S14 — DB driver (commit `fbe251e`)
- `packages/db/src/client.ts`: `@neondatabase/serverless` → `pg.Pool` + `drizzle-orm/node-postgres`.
- Pool кэшируется per connection string, `max:10`, timeouts.
- `closeAllPools()` для graceful shutdown.
- Drizzle ORM абстрагирует разницу — все callsites работают без правок.

### S15 — apps/api → Hono Node + Dockerfile (commit `73d8b41`)
- `apps/api/src/bindings.ts` (новый): `AppBindings` interface + `RateLimiter`/`ObjectStorage` interfaces (placeholders).
- `apps/api/src/server.ts` (новый): Node entrypoint через `@hono/node-server`, graceful shutdown.
- `apps/api/Dockerfile` (новый): multi-stage node:22-alpine + pnpm `--filter @x10/api...`.
- `tsx` в production runtime — workspace deps экспортируют `./src/index.ts` напрямую, build не нужен. Startup ~200ms.
- Тесты переписаны на `app.fetch(new Request(...), TEST_BINDINGS)` без `cloudflare:test`.
- Удалено: `index.ts`, `worker-configuration.d.ts`, `wrangler.toml`, `vitest.config.ts`.
- Smoke: `GET /health → 200 {"status":"ok",...}`.

### S16 — Redis + S3 (commit `e1516a0`)
- `services/redis.ts`: ioredis singleton (lazyConnect, maxRetries 3).
- `services/rate-limiter-redis.ts`: `RedisRateLimiter` через INCR + EXPIRE pipeline (fixed-window per minute). Fail-open при Redis errors с warning log.
- `services/s3-storage.ts`: `S3Storage` через `@aws-sdk/client-s3` (`forcePathStyle: true` для Timeweb). Web ReadableStream → Uint8Array конвертация.
- `server.ts` wiring: `buildRateLimiters(REDIS_URL)` + `buildObjectStorage(env)`. Если REDIS_URL не задан → noopLimiter (warning). Если S3_* неполные → upload endpoint вернёт 503.
- `.env.example`: новые `S3_*` + `REDIS_URL` секции.

### S17 — AI agents через Timeweb AI Gateway (commit `b392a0c`)
- **Подтверждено:** AI Gateway — OpenAI-совместимый прокси (НЕ Anthropic SDK). Base URL `https://api.timeweb.ai/v1`, model IDs с префиксом `anthropic/`.
- `packages/agents/src/openai-client.ts` (новый): OpenAI singleton с baseURL+apiKey кэшем.
- `packages/agents/src/define-agent.ts`: переписан под Chat Completions API:
  - `client.messages.create` → `client.chat.completions.create`
  - `tools` Anthropic format → OpenAI function calling
  - `tool_choice: {type:"tool", name}` → `{type:"function", function:{name}}`
  - `response.content[].tool_use.input` → `JSON.parse(response.choices[0].message.tool_calls[0].function.arguments)`
  - `usage.input_tokens/output_tokens` → `usage.prompt_tokens/completion_tokens`
  - Anthropic prompt caching (`cache_control: ephemeral`) **не поддерживается** через OpenAI-compat. Timeweb может применять prefix caching автоматически на стороне прокси, но это не публичный контракт.
- `packages/config/src/constants.ts`: MODELS с `anthropic/` префиксом. COST_PER_MTOK пересчитан под Timeweb (USD-эквивалент по 80 ₽/$1, +70% vs Anthropic direct).
- Tests: `mockOpenAI` helper, 24 callsite assertions переписаны на OpenAI format. 33/33 passed.
- Deps: `openai^4.x` добавлен, `@anthropic-ai/sdk` удалён.

### S18 — Workers Dockerfile + docker-compose (commit `c399c60`)
- `apps/workers/pipeline` зеркало S15: bindings.ts + app.ts + server.ts + Dockerfile.
- `inngest/cloudflare` → **`inngest/hono`** adapter.
- `docker-compose.yml` (root, новый) — полный local стек:
  - `postgres:18-alpine` (port 5432)
  - `redis:8-alpine` (port 6379)
  - `inngest/inngest:latest` self-host (port 8288)
  - `api` (apps/api Dockerfile, port 8080)
  - `pipeline` (apps/workers/pipeline Dockerfile, port 8787)
  - Healthchecks на postgres/redis для proper dependency ordering.
- Tests: 17/17 passed. Smoke: pipeline `/health → 200`.

### Env restructure
- `AI_GATEWAY_URL` + `AI_GATEWAY_API_KEY` — primary LLM auth (productionRequired).
- `ANTHROPIC_API_KEY` оставлен как legacy fallback (не обязателен).
- ZDR-check срабатывает только при direct Anthropic путь без AI_GATEWAY.
- `MASKER_BASE_URL`/`MASKER_API_KEY` убраны из productionRequired (доверяем Timeweb 152-ФЗ).

---

## 2. Mapping стека после миграции

| Слой | Было | Стало (Timeweb) |
|---|---|---|
| **БД** | Neon Postgres (Frankfurt) | DBaaS PostgreSQL 18 + pgvector |
| **Cache / rate limit** | CF Workers RateLimit binding | DBaaS Redis 8 + ioredis sliding window |
| **Object storage** | Cloudflare R2 | Хранилище S3 (S3-compat) + @aws-sdk/client-s3 |
| **API runtime** | Cloudflare Workers | App Platform Dockerfile (Hono on Node) |
| **Workers / Inngest** | CF Workers + Inngest cloud | App Platform Dockerfile + Inngest self-host (docker-compose в local) |
| **Frontend** | Vercel Next.js 16 | App Platform Next.js SSR (deploy не сделан) |
| **LLM** | Anthropic API direct | AI Gateway OpenAI-compat прокси |
| **Voice** | ElevenLabs через Render WS-proxy | Не сделано (отдельная задача) |
| **PII Masker** | KikuAI на Render | Опциональный (доверяем Timeweb 152-ФЗ) |
| **Auth** | Telegram session JWT (HIGH-2) | Без изменений |
| **Compliance** | Anthropic ZDR контракт | Timeweb "Соответствие 152-ФЗ" + DPA |

---

## 3. Состояние БД и миграции

Schema: 6 миграций (0000-0005), все применимы к Postgres 18 + pgvector.

```
0000_core.sql                          — users, articles, sources, authors, pipeline_config
0001_content_architecture.sql          — embeddings, klamps, events, digests
0002_community_engagement.sql          — reactions, bookmarks, user_reading_history, subscriptions
0003_engagement_triggers.sql           — DB triggers для счётчиков reactions/bookmarks
0004_pipeline_config_unique_agent.sql  — unique index (M7)
0005_uploads_log.sql                   — per-user upload quota (HIGH-7)
```

**Применить на Timeweb DBaaS:**
```bash
export DATABASE_URL='postgresql://...'  # из ЛК Timeweb DBaaS
pnpm --filter @x10/db db:migrate
pnpm db:seed  # 4 users + 5 authors + 10 klamps + 3 events + 2 articles + digest
```

---

## 4. Что работает сейчас (verified)

### Typecheck
```bash
pnpm typecheck   # 9/9 ✅ (FULL TURBO)
```

### Tests
```bash
pnpm --filter @x10/agents test            # 33/33 ✅
pnpm --filter @x10/worker-pipeline test   # 17/17 ✅
pnpm --filter @x10/api test               # health.test + engagement.test + auth-crypto.test
```
**Известное:** auth-crypto.test уже работает (не зависит от cloudflare:test). Engagement + health тесты переписаны на `app.fetch(new Request(...), TEST_BINDINGS)`.

### Smoke tests локально
```bash
# apps/api на Node
DATABASE_URL='postgresql://test:test@localhost/test' NODE_ENV=development PORT=8889 \
  pnpm --filter @x10/api start
# → ✓ x10-api listening on http://localhost:8889 (development)
# → GET /health → 200 OK

# apps/workers/pipeline на Node
DATABASE_URL='postgresql://test:test@localhost/test' NODE_ENV=development PORT=8788 \
  pnpm --filter @x10/worker-pipeline start
# → ✓ x10-worker-pipeline listening on http://localhost:8788 (development)
# → GET /health → 200 OK
```

### Полный local стек через docker-compose
```bash
cp .env.example .env  # заполнить AI_GATEWAY_API_KEY + TELEGRAM_BOT_TOKEN + JWT_SECRET
docker compose up --build
# postgres:5432, redis:6379, inngest:8288, api:8080, pipeline:8787
```

---

## 5. Discovery audit — критический gap со спекой

Полный отчёт см. в чате (сессия 14). Краткая сводка:

### Карта реальности

| Что построено | Что в спеке (autonomous контур) |
|---|---|
| Редакторский CMS (admin queue + publish UI) | Автономный сбор + постинг через партнёров и скраперы |
| 11 AI агентов как declarative defineAgent helpers | 13 агентов оркестрированные cron-ами + событиями |
| Inngest functions ждут события | Cron triggers (RSS 5 мин, TG 30 мин, daily 06:00 МСК) |
| HumanGate publish = `UPDATE articles SET status='published'` | Distribution в TG-Рыбакова + Дзен + VK + LinkedIn |
| `voice.md` + `about-me.md` | 4 per-channel voice файлов (tg-rybakov, vk, дзен, linkedin) |

### Топ-3 разрыва (по убыванию критичности)

1. **Источники не подключены.** `apps/workers/ingest/` — пустая папка (96 байт package.json). 0 RSS-скраперов (нет `rss-parser`/`cheerio` в коде). 0 TG-скраперов (нет `grammy`/`channel_post`). 0 cron schedules. Никто не отправляет `inngest.send({name: "source.item.received", ...})` автоматически — pipeline стоит на старте навсегда без ручного триггера.

2. **Постинг наружу не реализован.** SocialAmplifyAgent **генерирует текст** под TG/Дзен/VK, но никто не вызывает `bot.api.sendMessage` / VK API / Дзен API. Output остаётся в `articles.metadata.social`. `publishArticle()` — это `UPDATE articles SET status='published'` в БД, не distribution в каналы.

3. **Cron triggers отсутствуют.** Inngest functions реализованы как event-handlers, но никто не отправляет events по cron. В `wrangler.toml` (был удалён) cron не настраивался. В `docker-compose.yml` нет cron-сервиса. Все 4 функции запускаются только через ручной `POST /v1/pipeline/run` от editor'а.

### Что НЕ реализовано из спеки автономного контура (с указанием статуса)

**Блок A — СБОР (C1 Ingestion):**
- A1 RSS-скрапер 7 СМИ — ❌
- A2 Cron RSS 5 мин — ❌
- A3 Fallback при закрытом RSS — ❌
- A4 TG-сбор 30+ каналов клампов — ❌
- A5 Cron TG 30 мин — ❌
- A6 Ручной ввод из Admin (Tiptap+Yjs) — ❌ (нет редактора в admin)
- A7 SimHash дедуп — ❌
- A8 pgvector embedding + cosine 0.85 — ❌ (schema есть, кода нет)
- A9 KikuAI Masker — 🟡 (код есть, в S17 убран из productionRequired)
- A10 Enqueue с priority+topic — ❌
- A11 Retry exp backoff + degraded + алерт — 🟡 (Inngest retries есть, остальное нет)

**Блок B — ПАЙПЛАЙН (8+4 агента):**
- B1 SourceCurator (~200→~30) — ❌ (IngestAgent есть, но классификатор одного item, не отбор массива)
- B2 Draft → Numbers → FactCheck (Opus) → ToV → Brevity — ✅
- B3 AudioAgent (ElevenLabs WS-прокси) — ❌
- B4 DistributionAgent — ❌
- B5 HookGenAgent — ✅
- B6 SocialAmplifyAgent — 🟡 (генерирует текст, но не постит)
- B7 VisualAgent (Gemini через прокси) — ❌
- B8 ScoreAgent — 🟡 (есть, но событие никто не шлёт по cron)
- B9 NewsletterAssembleAgent — 🟡 (есть, но cron не настроен)
- B10 Kill switches — 🟡 (поля enabled/threshold в schema есть, runtime их не читает)

**Блок C — ПОСТИНГ (4 канала):**
- C1 TG-канал Рыбакова — ❌
- C2 Дзен API — ❌
- C3 VK Business API — ❌
- C4 LinkedIn — ❌
- C5 4 voice.md файлов — ❌ (есть только общий voice.md + about-me.md)

**Блок D — Обратная связь + оркестрация:**
- D1 ScoreAgent парсит engagement из API — ❌ (input есть, сборщика нет)
- D2 ScoreAgent обновляет pipeline_config — 🟡 (output recommendedThresholds есть, UPDATE не делается)
- D3 Workflow-движок выбран — ✅ (Inngest v4 self-host)
- D4 Очереди связывают воркеры — 🟡 (events есть, ingest/newsletter воркеры пустые)

### Финальный вердикт

**Контур НЕ автономен. Требует человека на каждом шаге:**
1. Ручной сбор/ввод источников
2. Ручной запуск pipeline через `/v1/pipeline/run` или admin UI
3. Ручная публикация в БД через HumanGate
4. Ручной постинг в TG/Дзен/VK через копи-пейст готовых текстов из `articles.metadata.social`

---

## 6. Что дальше — переприоритизация

**Развилка для следующей сессии:**

### Опция A — Достроить автономный контур (рекомендую обсудить с пользователем)

Объём: ~5-8 сессий. Что нужно:

1. **apps/workers/ingest** наполнить кодом:
   - RSS-скрапер (rss-parser + cheerio) для 7 СМИ
   - TG-скрапер через `grammy` для 30+ каналов клампов
   - Cron triggers (RSS 5 мин, TG 30 мин) — через node-cron или Inngest cron functions
   - SimHash dedup (импорт из npm или своя реализация)
   - pgvector embedding write + cosine query
   - `inngest.send({name: "source.item.received", ...})` после dedup

2. **apps/workers/posting** (новый воркер):
   - Telegram Bot API client (`grammy` или fetch на api.telegram.org)
   - VK Business API client
   - Дзен API client
   - LinkedIn API (опционально, feature flag)
   - Очередь постов с retry
   - События `posting.request` → платформо-специфичный handler

3. **SourceCurator agent** — выбор ~30 из ~200 по релевантности (Haiku).

4. **AudioAgent** — реальный клиент ElevenLabs через WS-прокси на Render (через AI Gateway если ElevenLabs там есть).

5. **VisualAgent** — Gemini 2.5 Flash через AI Gateway для инфографики.

6. **Per-channel voice.md** — 4 файла + загрузка в SocialAmplifyAgent.

7. **ScoreAgent feedback loop** — сборщик метрик из TG/VK/Дзен API + UPDATE `pipeline_config.confidence_threshold`.

8. **Cron triggers в Inngest** — `inngest.createFunction({ cron: "0 6 * * *" }, ...)` для daily 06:00 МСК, weekly Mon 09:00 МСК.

### Опция B — Принять что это CMS, продолжить с S19 deploy

Сейчас готов к деплою как **редакторский CMS**: editor вручную создаёт статью (через apps/api `/v1/pipeline/run`), редколлегия проверяет в admin queue, HumanGate publish меняет статус, miniapp читает feed.

Минусы: не соответствует исходной спеке (autonomous контур из X10ArchitectureSpec/AmplificationLayer документов).

### Опция C — Гибрид

Сделать deploy текущего состояния (опция B = S19), параллельно начать строить автономный контур (опция A), но deploy первый чтобы команда могла начать использовать.

**Решение требуется от пользователя** до начала следующей сессии.

---

## 7. Что НЕ изменилось из session 13

- Security posture: 24/25 closed (6/6 CRITICAL + 9/9 HIGH + 9/9 MEDIUM + L10). Только L1-L9 informational открыты.
- Brief B: закрыт (article reader optimistic UI + pipeline-config edit + rubrics filtering).
- HIGH-2 Telegram session auth: closed (session 11).
- HIGH-7 upload quota: closed (session 13).

---

## 8. Не работает / нужно для prod

1. **БД не развёрнута** — DBaaS Postgres + Redis в Timeweb не созданы.
2. **S3 bucket** не создан.
3. **AI Gateway API key** не получен.
4. **App Platform deploy** не сделан — 4 приложения (api/pipeline/miniapp/admin).
5. **@BotFather setup** — bot не создан, login_domain не зарегистрирован.
6. **Custom domains + SSL** не настроены.
7. **VERCEL_* GitHub secrets** не установлены (для CI/CD preview workflow, актуально если перенесём preview на Timeweb).
8. **vitest-pool-workers regression** — после S15 уже не актуально, тесты apps/api работают через прямой `app.fetch`.
9. **L1-L9 informational batch** — в backlog.
10. **🆕 АВТОНОМНЫЙ КОНТУР** — основной gap, см. секцию 5.

---

## 9. Стартовый промпт для новой сессии

> Прочитай `docs/handoffs/handoff-session-14.md` целиком. Это самый свежий handoff. Особенно важна **секция 5 (Discovery audit)** — она объясняет почему построенный код не соответствует исходной спеке автономного контура.
>
> Подтверди typecheck clean: `pnpm typecheck`. Подтверди tests: `pnpm -r test 2>&1 | tail -20`.
>
> Я хочу решить какой путь дальше:
> - **A** — достроить автономный контур (ingest workers + posting workers + cron + 4 voice + Audio/Visual агенты). ~5-8 сессий.
> - **B** — принять как CMS, продолжить S19 deploy на Timeweb. ~2-3 сессии.
> - **C** — параллельно (deploy CMS + начать строить автономность).
>
> Покажи актуальный план под выбранную опцию перед действиями.
