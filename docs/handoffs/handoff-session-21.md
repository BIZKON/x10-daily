# Handoff · Session 21 — M4: надёжная дослыка ops-алертов (delivered_at + cron-дослыка)

**Дата:** 5 июня 2026
**Что произошло:** Взял задачу (a) из аудита session 20 — единственный незакрытый **medium**. Раньше $-алерт мог **потеряться молча**: claim строки `cost_alerts` (идемпотентность) и отправка в TG были связаны — если send падал (хиккап сети / краш между claim и send), строка уже существовала → `claimAlert` навсегда возвращал false → уведомление не уходило. Это отказ самого механизма безопасности дневного $-потолка на 24/7-контуре. Закрыл: разделил «заклеймлен» и «доставлен» + добавил cron-дослыку недоставленных. Задеплоено и **верифицировано живьём** (реальный cron дослал тестовый алерт в личку).
**Репозиторий:** https://github.com/BIZKON/x10-daily
**HEAD:** `83114aa` (+ этот handoff) · `origin/main` synced · задеплоено на VM (VM HEAD `83114aa`).
**Предыдущий handoff:** [handoff-session-20.md](./handoff-session-20.md) ($-потолок + cost-ledger + ops-алерты + /cost + /posting). Inventory/доступы — memory `project_x10_deploy_state.md`.

---

## 0. TL;DR — что ЖИВО ПРЯМО СЕЙЧАС

- Всё из session 20 (7 контейнеров, $-потолок $15/$9, /cost, /posting со тихими часами 21→09 МСК, 5 RSS).
- **НОВОЕ: ops-алерты больше НЕ теряются при сбое TG.** `cost_alerts` получила `message` / `delivered_at` / `attempts` / `last_error`. Клейм за (день, порог) больше НЕ означает доставку — её подтверждает `delivered_at`.
- **НОВОЕ: cron `retry-ops-alerts` (*/10)** сканит недоставленные алерты (`delivered_at IS NULL`, частичный индекс) и дослыает по сохранённому `message`. Кап 12 попыток, окно 48ч. НЕ гейтится `/posting` (ops-безопасность должна доходить даже на паузе постинга).
- **Проверено живьём:** синтетическую недоставленную строку реальный деплойнутый cron дослал в личку (`дослано 1/1`), `delivered_at` проставлен, `attempts=0`. Тестовая строка удалена.
- **Миграция 0008 → 0009.** Pipeline 77/77 тестов зелёные, repo-wide typecheck чист.

---

## 1. Что изменилось (коммит `83114aa`)

| Файл | Что |
|---|---|
| [pipeline.ts](../../packages/db/src/schema/pipeline.ts) (`costAlerts`) | +`message` / `delivered_at` / `attempts` / `last_error` + частичный индекс `cost_alerts_pending_idx` (delivered_at IS NULL) |
| [0009_cost_alerts_delivery.sql](../../packages/db/drizzle/0009_cost_alerts_delivery.sql) | ADD COLUMN (4 шт) + backfill старых строк `delivered_at=created_at` + индекс |
| [cost-ledger.ts](../../apps/workers/pipeline/src/lib/cost-ledger.ts) | `claimAlert` теперь хранит `message` и возвращает **id\|null** (не boolean); +`markAlertDelivered`, `recordAlertAttempt`, `listPendingAlerts` |
| [ops-alert.ts](../../apps/workers/pipeline/src/lib/ops-alert.ts) | `sendOpsAlert` → возвращает `{delivered, reason}` (не void); +`attemptDelivery` (send → markDelivered / recordAttempt), +`deliverOpsAlert` (claim → быстрая попытка) |
| [draft-article.ts](../../apps/workers/pipeline/src/inngest/functions/draft-article.ts) | оба call-site (warn/exhausted) → `deliverOpsAlert`; текст строится inline и сохраняется для дослыки |
| [retry-ops-alerts.ts](../../apps/workers/pipeline/src/inngest/functions/retry-ops-alerts.ts) | **новый** Inngest cron `*/10` — дослыка из очереди |
| [app.ts](../../apps/workers/pipeline/src/app.ts) | регистрация `createRetryOpsAlertsFunction` (теперь 7 функций) |
| тесты | `cost-ledger.test` (claim id+message, mark/record/listPending), новый `ops-alert.test` (attemptDelivery/deliverOpsAlert), `draft-article.test` под deliverOpsAlert, e2e mock |

**Контракт доставки (ключевое):**
- `deliverOpsAlert` = claim (идемпотентно) → если заклеймлено → **быстрая попытка** send. Провал send → строка остаётся `delivered_at IS NULL` + `attempts+1`/`last_error` → cron дослыает.
- `sendOpsAlert` по-прежнему **НИКОГДА не бросает** (иначе ретрай Inngest-шага + риск непубликации: `budget-warn-alert` стоит ПЕРЕД `notify-ready`). Вместо throw — результат.
- `message` хранится → sweeper шлёт **verbatim**, без пересборки текста из env-порогов (которые к моменту ретрая могли измениться).

---

## 2. ⚠️ ГЛАВНАЯ ГРАБЛЯ ЭТОЙ СЕССИИ — re-sync Inngest ТОЛЬКО с `pipeline:8787`, НЕ с localhost

**Что сделал не так:** после деплоя дёрнул re-sync новой cron-функции командой `PUT /inngest` **изнутри pipeline-контейнера на `http://localhost:8787`**. Inngest SDK берёт свой callback-URL из Host входящего запроса → зарегистрировал app-URL как **`http://localhost:8787/inngest`**. Inngest-сервер (ОТДЕЛЬНЫЙ контейнер) стал звать `localhost:8787` → попадал в себя → `EOF writing request to SDK` → `function.failed`. **Это сломало ВСЕ функции, включая живой `ingest-rss`** (падал ~25 мин, 07:15–07:40 UTC).

**Фикс:** `PUT http://pipeline:8787/inngest` из **другого** контейнера (api) → Host=`pipeline:8787` → app-URL зарегистрировался правильно. Подтверждение: GraphQL `{ apps { url functionCount } }` → `http://pipeline:8787/inngest`, 7 функций. Всё восстановилось, EOF исчез, `ingest-rss` снова `function.finished`.

**Уроки на будущее:**
1. **После `deploy.sh` (recreate, те же id функций) ручной re-sync НЕ нужен вообще** — app сам регистрируется на boot с правильным host. Даже для НОВОЙ функции (новый id) recreate подхватил её сам (видно по тому, что после фикса все 7 на месте).
2. **Если re-sync всё же нужен** (как session 19 при переименовании id) — делай его **только с `http://pipeline:8787/inngest` из api/inngest-контейнера**. НИКОГДА не с `localhost` изнутри pipeline.
3. Диагностика: `docker compose logs inngest | grep -E "EOF|localhost:8787"` — если видишь `localhost:8787` в `url` — app-URL побит, перерегистрируй с pipeline:8787.
4. Потери данных НЕТ: ingest идемпотентен (`seen_items` dedup) + poll-gating 15 мин → пропущенные тики самозалечиваются на следующем.

**Прочие нюансы:**
5. Миграции hand-written (как 0001–0008) + journal. `0009` записан в `_journal.json` (idx 9). **`db:generate` НЕ запускать** (стейл 0000-snapshot). drizzle-kit migrate применяет по journal + .sql (snapshots не нужны).
6. Backfill в 0009: старые строки `cost_alerts` помечены `delivered_at=created_at` → sweeper не дослыает их задним числом. В проде `cost_alerts` был пуст (warn/exhausted ни разу не срабатывали), так что backfill — на будущее.
7. `voice.md` — без изменений (не трогал). Анти-англицизм для постов — как в session 20.

---

## 3. Деплой + верификация (как делал, session 21)

- push → `ssh root@37.77.105.82` → `cd /opt/x10-daily && ./deploy.sh` (git pull --ff-only + build pipeline + migrate 0009 + up -d).
- Проверено живьём:
  - VM HEAD `83114aa`, 7 контейнеров healthy, pipeline IPv6 цел.
  - Миграция 0009 применилась: `cost_alerts` имеет `message`/`delivered_at`/`attempts`(default 0)/`last_error`; индекс `cost_alerts_pending_idx`; `drizzle.__drizzle_migrations` записал 0009 (created_at 1780578972448 = journal `when`).
  - GraphQL: `x10-pipeline-retry-ops-alerts` зарегистрирован с триггером `CRON */10 * * * *`; app-URL `http://pipeline:8787/inngest`, 7 функций.
  - **End-to-end:** вставил синтетическую `delivered_at IS NULL` строку (alert_date=вчера, чтобы не занять сегодняшний warn/exhausted-слот; в окне 48ч) → реальный cron в 07:40:00 UTC дослал её: pipeline-лог `retry-ops-alerts: дослано 1/1 недоставленных алертов`, `delivered_at` проставлен, `attempts=0`, **сообщение пришло в личку** (TG_OPS_CHAT_ID=247247870). Тестовая строка удалена (`cost_alerts` снова пуст).
  - `ingest-rss` */5 в 07:45:00 → `function.finished` (после фикса URL).

---

## 4. Осталось (пост-M0) — без изменений по приоритетам

- **Autonomous контур:** VK/Дзен posting (нужны API-ключи VK + OAuth, доступ к Дзен); AudioAgent (ElevenLabs + WS-прокси на Render). RSS — сделано (session 19).
- **Dedicated `@x10_daily_test_bot`** (сейчас одолжен `@Sekretar_Syrov_IP_bot`; он же → auth-бот Mini App).
- **Домен** x10.media (РФ-доступный DNS).
- **Sentry** (SENTRY_DSN пуст) / **S3-аватары**.
- **Хвост аудита (LOW):** L1 (per-agent ledger для всех terminal-fail), L2 (soft-cap overshoot ≤ concurrency×$0.45 — задокументировать), L3 (record-run идемпотентность), L7-L8, L10-L12, L15-L18. Полный отчёт — tmp `…/tasks/whjv1en1d.output`.
- ✅ ~~M4~~ — закрыт этой сессией. **Все medium из аудита session 20 закрыты.**

---

## 5. Стартовый промпт для следующей сессии

> Прочитай (в порядке): `docs/handoffs/handoff-session-21.md` + `handoff-session-20.md` + memory `project_x10_deploy_state.md` + CLAUDE.md. Если трогаем Timeweb-инфру — skill `timeweb-telegram-deploy`.
>
> Состояние: M0 + walking-skeleton ЖИВ и АВТОНОМЕН на Timeweb. Cron `ingest-rss` (*/5, gating) → 5 RSS → IngestAgent gate → draft (B2 через AI Gateway) → post-to-tg → «Деловой вестник» (-1003773645085). **HEAD `83114aa`.** ⚠️ api.telegram.org только по IPv6 (NAT66).
>
> Session 21 итог: **M4** — надёжная дослыка ops-алертов. `cost_alerts` +`message`/`delivered_at`/`attempts`/`last_error`; `claimAlert` → id\|null + хранит текст; `deliverOpsAlert` (claim → быстрая попытка); новый cron `retry-ops-alerts` (*/10) дослыает недоставленные (кап 12, окно 48ч), НЕ гейтится /posting. Миграция 0009. Проверено живьём (cron дослал тест-алерт в личку). **Все medium аудита закрыты.**
>
> ⚠️ ГРАБЛЯ session 21: re-sync Inngest делать ТОЛЬКО `PUT http://pipeline:8787/inngest` из api-контейнера. НЕ с localhost изнутри pipeline (ломает app-URL → EOF → падают ВСЕ функции). После обычного `deploy.sh` re-sync вообще не нужен.
>
> VM: `ssh root@37.77.105.82`, репо `/opt/x10-daily`, передеплой `./deploy.sh`. НЕ создавай/удаляй VM циклично (Timeweb fraud-detection).
>
> Выбери: (b) VK/Дзен posting (нужны ключи + OAuth); (c) AudioAgent (ElevenLabs + WS-прокси Render); (d) dedicated @x10_daily_test_bot + auth Mini App; (e) домен x10.media; (f) Sentry / S3-аватары; (g) хвост LOW из аудита (whjv1en1d.output).

---

## 6. Ссылки

| Хочешь | Открой |
|---|---|
| Inventory + доступы + грабли | memory `project_x10_deploy_state.md` |
| Дослыка / клейм / ledger | [cost-ledger.ts](../../apps/workers/pipeline/src/lib/cost-ledger.ts), [ops-alert.ts](../../apps/workers/pipeline/src/lib/ops-alert.ts) |
| Cron дослыки | [retry-ops-alerts.ts](../../apps/workers/pipeline/src/inngest/functions/retry-ops-alerts.ts) |
| Миграция | [0009_cost_alerts_delivery.sql](../../packages/db/drizzle/0009_cost_alerts_delivery.sql) |
| Предыдущий handoff | [handoff-session-20.md](./handoff-session-20.md) |
