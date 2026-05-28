# Handoff · Session 16 — Walking Skeleton (ТЗ #1) + M0 deploy stack (ТЗ #2)

**Дата:** 28 мая 2026
**Что произошло:** Две большие задачи плюс инфраструктурный фикс одной регрессии. Первое — тонкий вертикальный срез автономного контура (vc.ru → TG, доказательство что pipeline работает без человека). Второе — полный код/конфиг прод-стека для одной Timeweb VM (Docker Compose + Caddy + managed PG + Inngest self-host).
**Репозиторий:** https://github.com/BIZKON/x10-daily
**HEAD:** `f966e02` · `origin/main` synced · working tree clean.

---

## 1. Коммиты сессии (4 штуки, все запушены)

| SHA | Тип | Что |
|---|---|---|
| `33f336b` | `fix(api)` | UUID в engagement.test → Zod 4 v4 format (регрессия после S15/S16/S17) |
| `e58cbed` | `feat(workers)` | Walking Skeleton (ТЗ #1) — автономный срез vc.ru → TG |
| `2eb65a5` | `docs(voice)` | visual.md — operational rules для VisualAgent + карточек |
| `f966e02` | `feat(infra)` | M0 deploy stack — Timeweb VM (Docker + Caddy + managed PG) |

Перед сессией: `f80708e docs(handoff): session 14 — Timeweb migration + discovery audit`.

---

## 2. Walking Skeleton (ТЗ #1) — кратко

**Цель:** один vc.ru RSS item проходит cron → fetch → dedup → B2 цепочка → реальный sendMessage в TG-канал без единого клика.

**Что добавилось:**
- `apps/workers/ingest/` — workspace library с `fetchVcRss()` (rss-parser), `simhash64()` (FNV-1a руками, без deps), `markIfNew()`/`ensureSource()` через новую таблицу `seen_items`.
- `apps/workers/pipeline/src/inngest/functions/ingest-vc-rss.ts` — cron `*/5 * * * *`, эмитит `source.item.received`.
- `apps/workers/pipeline/src/inngest/functions/post-to-tg.ts` — слушает `article.ready`, реальный fetch на `api.telegram.org/.../sendMessage|sendPhoto`, ветвление по `channels.visual_ref`.
- В `draft-article.ts` — одна строка `step.sendEvent("article.ready", ...)` после persist (B2 цепочка агентов не тронута).
- Schema migration `0006_seen_items_channels.sql` — `seen_items` (source_id, external_id, fingerprint) + `channels` (article_id, channel, text, visual_ref) + `channel_kind` enum.
- E2E тест [walking-skeleton.e2e.test.ts](../../apps/workers/pipeline/test/walking-skeleton.e2e.test.ts) — 3 кейса: cron→sendMessage, второй тик без дублей, sendPhoto ветка под `visual_ref="stub://photo.jpg"`.

**DoD по ТЗ #1:**
- [x] реальный cron-триггер `triggers: [{ cron: "*/5 * * * *" }]` в `ingest-vc-rss.ts:37`
- [x] e2e зелёный, триггерит только cron-функцию
- [x] повторный тик не публикует дубль
- [x] sendPhoto/sendMessage ветвление под тестом
- [x] B2 + `packages/agents` не тронуты
- [⚠️] live-smoke в реальный TG-канал — НЕ выполнен (ждёт prod envs)

---

## 3. visual.md — для VisualAgent (ТЗ #2 будущий)

`packages/voice/visual.md` (брат `voice.md`):
- Палитра (red/gold/steel/surface), типографика, off-limits (золото-роскошь, мотивационный сток, лица ньюсмейкеров, 3D-фигурки NB2)
- Разделение труда NB2 vs шаблон карточки (NB2 НЕ рендерит текст/логотипы)
- Промт-скелет VisualAgent: STYLE + PILLAR + SUBJECT + NEGATIVE + TECH
- Технические параметры NB2 (Gemini 3.1 Flash через Timeweb Gateway, aspects, SynthID+C2PA)

Экспортируется через `@x10/voice`:
```ts
import { VOICE_RULES, ABOUT_ME, VISUAL_RULES, BLACKLIST } from "@x10/voice";
```

VisualAgent ещё не реализован — спека готова для ТЗ #2 расширения.

---

## 4. M0 Deploy Stack (ТЗ #2) — кратко

**Цель:** один прогон `./deploy.sh` на Timeweb Cloud Server поднимает стек по HTTPS.

**Что добавилось:**
- `docker-compose.prod.yml` — 7 сервисов: redis · inngest · api · pipeline · admin · miniapp · caddy. **Без postgres** (managed Timeweb DBaaS).
- `caddy/Caddyfile.prod` — env-driven домены (`api.${X10_BASE_DOMAIN}` / `admin.<...>` / `app.<...>`), auto-TLS Let's Encrypt HTTP-01.
- `apps/admin/Dockerfile` + `apps/miniapp/Dockerfile` — multi-stage Next.js 16 standalone (после `output: "standalone"`).
- `deploy.sh` — git pull → build → migrate → up -d, проверяет required env keys.
- `.env.example` расширен (X10_BASE_DOMAIN, CADDY_ACME_EMAIL, INNGEST_POSTGRES_URI, X10_ALLOWED_ORIGINS).
- `docs/strategy/architecture-spec.md` — НОВЫЙ источник истины (Type-2 server-authoritative, managed PG, ingest-as-library, Zero дропнут). PDF `X10ArchitectureSpec.pdf` устарел.

**Критический bug fix (был открытым риском N0 из ТЗ #1):**
4 pipeline функции создавали `AgentContext = { apiKey: env.ANTHROPIC_API_KEY, masker }` **без `baseURL`**. OpenAI SDK без `baseURL` бил в `https://api.openai.com/v1`, не в Timeweb Gateway. Фикс: `apiKey: env.AI_GATEWAY_API_KEY ?? env.ANTHROPIC_API_KEY, baseURL: env.AI_GATEWAY_BASE_URL`. **N6 unblocked в коде**, live-проверка ждёт реальный ключ.

**Rename:** `AI_GATEWAY_URL` → `AI_GATEWAY_BASE_URL` (по ТЗ #2), 12 файлов sweep.

**Zero cleanup:** `git grep rocicorp` → 0 хитов. Deps cleanup — no-op (никогда не ставили). Docs sync — в `architecture-spec.md`.

**DoD по ТЗ #2:**
- [x] `docker-compose.prod.yml` без postgres, DATABASE_URL ссылается на managed
- [x] секреты в репо — 0 хитов; `.env*` в `.gitignore`
- [x] Caddy TLS-конфиг готов (auto LE)
- [x] Inngest prod-mode (без INNGEST_DEV, persist через INNGEST_POSTGRES_URI)
- [x] AI Gateway пропускается до agents через `baseURL`
- [x] healthchecks + `restart: unless-stopped`
- [x] standalone build admin+miniapp
- [x] Zero дропнут, спека синхронизирована
- [x] `packages/agents/*` не тронут
- [⚠️] live deploy на VM — НЕ выполнен
- [⚠️] live `chat.completions` через Gateway — НЕ выполнен (ждёт ключ)
- [⚠️] live миграции на managed PG — НЕ выполнен (ждёт provisioned кластер)

Подробнее по live-acceptance в [handoff-session-15.md §3](./handoff-session-15.md) — manual steps на Timeweb.

---

## 5. Состояние тестов / typecheck

```
typecheck: 10/10 ✅ (FULL TURBO)
tests:     70/70 ✅
  @x10/agents          33/33
  @x10/api             17/17
  @x10/worker-pipeline 20/20
docker compose -f docker-compose.prod.yml config → валиден
secrets git grep → 0 хитов
```

---

## 6. Что РЕАЛЬНО осталось сделать руками

### A — Live M0 deploy (нужны окружения)
1. **Timeweb DBaaS PostgreSQL 17 (Москва):** создать кластер, включить расширение `vector` через Конфигурация → Расширения. Без этого `0000_core.sql:1` `CREATE EXTENSION vector` упадёт.
2. `CREATE SCHEMA IF NOT EXISTS inngest;` в той же БД (для prod Inngest persist).
3. **DNS:** `api.x10.media` / `admin.x10.media` / `app.x10.media` → IP VM.
4. **VM:** Docker + Compose v2, `git clone /opt/x10-daily`, `cp .env.example .env.production`, `chmod 600`, заполнить, `./deploy.sh`.
5. **Live verify N2/N4/N5/N6:**
   - `\dx` показывает `vector`
   - `https://api.x10.media/health` → 200 (валидный сертификат)
   - Inngest dashboard (`ssh -L 8288:localhost:8288`) → 6 функций зарегистрированы
   - Один `curl $AI_GATEWAY_BASE_URL/chat/completions` → OpenAI-формат

### B — Walking Skeleton live-smoke
После A:
- В `.env.production` задать `TG_TEST_CHANNEL_ID` (бот должен быть админом канала)
- Дождаться cron tick `*/5` → пост в тестовом TG-канале
- Проверить `message_id` в логах `docker compose logs pipeline`

### C — Расширение autonomous контура (отложено)
- ТЗ #2-style: 6 RSS-СМИ кроме vc.ru, TG-каналы клампов через grammy, SourceCurator (~200→~30), VK / Дзен / LinkedIn posting, 4 per-channel voice.md, AudioAgent через ElevenLabs WS-proxy, VisualAgent через Gemini 3.1 Flash (NB2)
- ТЗ #3: pgvector cosine дедуп (слой 2), ScoreAgent feedback loop в `pipeline_config`, Newsletter cron, runtime kill switches

### D — Не критичное
- L1-L9 informational security backlog (см. handoff-session-13)
- Sentry DSN + PostHog key — задать когда нужно мониторинг

---

## 7. Известные риски

1. **Inngest self-host env vars** — точные имена `INNGEST_POSTGRES_URI` могут отличаться между минорами CLI. Проверить `docker run inngest/inngest --help` на VM. Fallback — CLI флаги `--postgres-uri`.
2. **Next.js 16 standalone в monorepo** — путь к `server.js` зависит от workspace layout. Если build упал — посмотреть структуру `apps/admin/.next/standalone/` после `next build`.
3. **Caddy auto-TLS** требует валидный DNS на момент первого старта. Для dry-run использовать LE staging: добавить `acme_ca https://acme-staging-v02.api.letsencrypt.org/directory` в Caddyfile блок `{...}`.
4. **N6 live-результат** — если Timeweb Gateway отвечает не в OpenAI-формате (что было бы сюрпризом), это discovery. Адаптер ответов будет в `packages/agents/src/define-agent.ts` — но это отдельный ТЗ.

---

## 8. Стартовый промпт для нового чата

> Прочитай `docs/handoffs/handoff-session-16.md` и `docs/handoffs/handoff-session-15.md` (M0 deploy детали). Текущий HEAD `f966e02`, working tree clean, 70/70 tests, typecheck 10/10.
>
> Live-acceptance M0 ждёт: managed PG provision + vector extension + DNS + `./deploy.sh` на VM. Если deploy уже сделал — расскажи что показал `\dx`, `docker compose ps`, `curl https://api.x10.media/health` и реальный `chat.completions` через Gateway.
>
> Если deploy не сделан — реши что дальше: (a) сделать live deploy сейчас (нужны Timeweb credentials и я тебя проведу по шагам), (b) расширять autonomous контур (ТЗ #2-style: ещё RSS-источники, posting в VK/Дзен, AudioAgent), (c) разбирать pgvector/cosine дедуп (ТЗ #3).

---

## 9. Ссылки на ключевые файлы

| Хочешь | Открой |
|---|---|
| Архитектура актуальная | [docs/strategy/architecture-spec.md](../strategy/architecture-spec.md) |
| Visual canon | [packages/voice/visual.md](../../packages/voice/visual.md) |
| Walking Skeleton e2e | [walking-skeleton.e2e.test.ts](../../apps/workers/pipeline/test/walking-skeleton.e2e.test.ts) |
| Cron ingest | [ingest-vc-rss.ts](../../apps/workers/pipeline/src/inngest/functions/ingest-vc-rss.ts) |
| Real TG outbound | [post-to-tg.ts](../../apps/workers/pipeline/src/inngest/functions/post-to-tg.ts) |
| Prod compose | [docker-compose.prod.yml](../../docker-compose.prod.yml) |
| Caddy reverse proxy | [caddy/Caddyfile.prod](../../caddy/Caddyfile.prod) |
| Deploy script | [deploy.sh](../../deploy.sh) |
| M0 manual steps | [handoff-session-15.md §3](./handoff-session-15.md) |
| Discovery audit (S14) | [handoff-session-14.md §5](./handoff-session-14.md) |
