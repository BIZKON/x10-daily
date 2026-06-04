# Handoff · Session 20 — Пост-M0 hardening: $-потолок + cost-ledger + ops-алерты + фикс форматирования TG

**Дата:** 4 июня 2026
**Что произошло:** Взял задачу (d) — пост-M0 hardening. Закрыл главный риск работающего 24/7 контура: **дневной $-потолок** (бурст источников не съест бюджет). Попутно воскресил мёртвую таблицу `pipeline_runs` как реальный $-ledger, добавил **poll_interval gating** источников и **починил баг форматирования TG-постов** (слипались из-за литеральных `\n`). Всё задеплоено и верифицировано живьём.
**Репозиторий:** https://github.com/BIZKON/x10-daily
**HEAD:** `5f8d137` (+ этот handoff) · `origin/main` synced · задеплоено на VM.
**Предыдущий handoff:** [handoff-session-19.md](./handoff-session-19.md) (multi-source RSS, 5 источников). Inventory/доступы — memory `project_x10_deploy_state.md`.

---

## 0. TL;DR — что ЖИВО ПРЯМО СЕЙЧАС

- Всё из session 19 (7 контейнеров, HTTPS, AI Gateway, Inngest, IPv6/NAT66, 5 RSS-источников → AI → пост в «Деловой вестник»).
- **НОВОЕ: жёсткий дневной $-потолок $15/день (warn $9).** `draft-article` в начале суммирует расход за день МСК по `pipeline_runs.cost_usd`; при ≥ потолка статья пропускается (агенты не запускаются) до полуночи МСК. Часовой `rateLimit` (50/час) — второй контур.
- **НОВОЕ: `pipeline_runs` ожила как $-ledger.** `draft-article` пишет агрегатную строку на статью, `process-source-item` — строку гейта на каждый item (вкл. reject).
- **НОВОЕ: ops-алерты в Telegram** (warn/exhausted), идемпотентность «один на (день МСК, порог)» через таблицу `cost_alerts`. Канал `TG_OPS_CHAT_ID` — ⚠️ **ПОКА НЕ ЗАДАН → алерты идут в логи** (`docker logs pipeline`). Потолок работает независимо.
- **НОВОЕ: poll_interval gating.** Источники поллятся не чаще `poll_interval_sec` (default 900 = 15 мин), а не каждые 5.
- **ФИКС: TG-посты больше не слипаются.** Был баг в промптах (`\n` как текст) + защитная нормализация. Проверено на первом post-deploy посте — чистые абзацы.

---

## 1. Что изменилось (коммиты)

| SHA | Что |
|---|---|
| `fe4e581` | feat(pipeline): дневной $-потолок + cost-ledger + ops-алерты |
| `dc3db20` | feat(ingest): poll_interval gating источников |
| `5f8d137` | fix(agents): TG-посты слипались — литеральные `\n` вместо переносов |
| `08ca51c` | fix(agents): английские лейблы в постах (BEFORE/AFTER/BRIDGE, Yes but) |

### $-потолок + ledger ([draft-article.ts](../../apps/workers/pipeline/src/inngest/functions/draft-article.ts), [cost-ledger.ts](../../apps/workers/pipeline/src/lib/cost-ledger.ts))
- `pipeline_runs` была определена в схеме, но **в неё никто не писал** — теперь это источник истины по $.
- `budget-gate` (первый step): `getTodaySpendUsd` = `sum(cost_usd)` за календарный день МСК (UTC+3). При ≥ `DAILY_BUDGET_USD` → return `{skipped, reason:"daily-budget-exceeded"}`, exhausted-алерт (idempotent), агенты НЕ стартуют.
- В конце: `record-run` (agent='draft', cost=totalCost, токены, per-agent $ в `output`) → потом `budget-warn-alert` (пересчёт уже с этой статьёй; warn один раз/день).
- `process-source-item` → `record-gate` (agent='ingest', status accept=succeeded / reject=skipped) ДО раннего return → reject тоже учитывается.
- ⚠️ **Failed/halted drafts НЕ пишутся в ledger** (record-run после persist, halt бросает раньше) → дневной расход слегка недосчитывает упавшие драфты (FactCheck-halt, retry-fail). Гейт-стоимость таких — учтена. Приемлемо для потолка.

### ops-алерты ([ops-alert.ts](../../apps/workers/pipeline/src/lib/ops-alert.ts), [telegram.ts](../../apps/workers/pipeline/src/lib/telegram.ts))
- `cost_alerts (alert_date date, threshold_kind enum, unique(date,kind))` — `claimAlert` через `INSERT ON CONFLICT DO NOTHING` → алерт шлётся только при реальной вставке (идемпотентно к ретраям/конкурентным ранам).
- `lib/telegram.ts` — общий Bot-API клиент, выделен из `post-to-tg` (DRY). IPv6-путь как был.
- `sendOpsAlert` best-effort (не роняет шаг). Нет `TG_OPS_CHAT_ID`/токена → `console.warn`.

### poll gating ([dedupe.ts](../../apps/workers/ingest/src/dedupe.ts), [ingest-rss.ts](../../apps/workers/pipeline/src/inngest/functions/ingest-rss.ts))
- `isSourceDue(src, now)`: null lastPolledAt → due; иначе прошло ли ≥ pollIntervalSec.
- `markSourcePolled` пишет `last_polled_at` ТОЛЬКО при успехе → битый источник ретраится каждый тик.
- `now` мемоизирован в step (детерминизм при ретрае).

### фикс форматирования TG ([text.ts](../../apps/workers/pipeline/src/lib/text.ts), social-amplify.ts, hookgen.ts)
**Заход #1 (`5f8d137`) — литеральные `\n`:**
- **Корень:** в TS-шаблоне `\\n` рендерится в 2 символа `\n`, и агенту было буквально написано «post — текст с `\n` как переносы». Модель то ставила настоящий перенос, то печатала `\n` как текст → «то нормально, то сплошняком».
- Промпты поправлены (просим НАСТОЯЩИЕ переносы). `normalizeNewlines`: литеральные `\n`/`\r\n`/`\t` → реальные, схлоп 3+, trim.

**Заход #2 (`08ca51c`) — английские ЛЕЙБЛЫ в тексте поста:**
- **Корень:** модель печатала в `post` названия стадий framework BAB (`BEFORE.`/`AFTER.`/`BRIDGE.`) как заголовки секций + блоки Smart Brevity латиницей (`Yes, but`/`What's next` — из `voice.md`, где они описаны как заголовки). + правила канала `tg-x10` НЕ запрещали англицизмы (в отличие от tg-rybakov/vk) → `sandbox` и т.п.
- Промпт `social-amplify`: post — чистой русской прозой, framework НЕВИДИМ (имена стадий только в `segments`), без латинских заголовков-меток, контраст по-русски («Но…» вместо «Yes, but»); анти-англицизм добавлен в `tg-x10`.
- `stripStructuralLabels` (bounded-набор английских лейблов в начале строк, инлайн + отдельной строкой) + `cleanPostText = normalizeNewlines + strip`.
- ⚠️ `voice.md` (строки 28/94) всё ещё описывает Smart Brevity блоки английскими именами — НЕ трогал (канон ToV); social-prompt override + stripper перекрывают для публикуемого поста. При добавлении VK/Дзен/newsletter — учесть.

`cleanPostText` применён в `draft-article` (channels+metadata+return) и защитно в `post-to-tg` на `row.text` (чинит даже старые строки на отправке). Проверено: задеплоенный `cleanPostText` в контейнере срезает реальный артефакт; 52/52 unit-тестов (вкл. точный кейс из прода).

---

## 2. ⚠️ Грабли / нюансы (НЕ наступить)

1. ✅ **`TG_OPS_CHAT_ID=247247870` ЗАДАН** (@profysales, личка Константина) + проверен тестовым сообщением (доставлено). Прокинут через compose `environment:` (поимённо — НЕ env_file!) + значение в `.env.production`. `DAILY_BUDGET_USD`/`WARN` тоже добавлены в compose с дефолтами 15/9 (настраиваются из `.env` без правки кода). ⚠️ Бот не пишет первым — юзер должен был хоть раз нажать Start боту (Константин уже общался → ОК). Менять chat: правка `.env.production` + `docker compose -f docker-compose.prod.yml up -d pipeline` (без rebuild).
2. **Дневной расход считается по `pipeline_runs`, день — МСК (UTC+3).** budget-gate: `sum(cost_usd) WHERE created_at >= МСК-полночь`. Сброс в полночь МСК. Сейчас (session 20) при тесте было ~$0.32/день.
3. **Миграции hand-written** (как 0001-0006, без snapshots в meta/). `0007_cost_alerts` + запись в `_journal.json`. НЕ запускать `db:generate` (диффнет против устаревшего 0000-snapshot → мусор). Новую миграцию писать руками + журнал.
4. **Poll gating сменил каденс:** источники теперь поллятся раз в 15 мин (poll_interval_sec=900), не каждые 5. Хочешь чаще конкретный источник — `UPDATE sources SET poll_interval_sec=300 WHERE name=...`.
5. **biome:** в репо нет enforced lint (turbo run lint = no-op). `useTemplate`/`noNonNullAssertion` первазивны, не блокеры. Формат применяю `biome check --apply` на изменённых файлах.

---

## 3. Деплой + верификация (как делал, session 20)

- push → `ssh root@37.77.105.82` → `cd /opt/x10-daily && ./deploy.sh` (git pull --ff-only + build + migrate 0007 + up -d). Re-sync Inngest НЕ требовался (id функций не менялись, только код).
- Проверено живьём:
  - HEAD `5f8d137`, 7 контейнеров healthy, pipeline IPv6 `fdf0:...::5` цел.
  - `cost_alerts` + uniq-индекс созданы (миграция применилась).
  - `pipeline_runs`: ingest succeeded 2 / skipped 1, draft succeeded $0.2947. Дневной расход МСК $0.32 (< warn $9).
  - Все 5 источников получили `last_polled_at` (gating пишет).
  - **Первый post-deploy пост (MOEX) — чистые абзацы** (12 реальных `chr(10)`, ноль литеральных `\n`).

---

## 4. Осталось (пост-M0)

- ✅ ~~`TG_OPS_CHAT_ID`~~ — задан (247247870, @profysales) + проверен. $-алерты идут в личку.
- **Autonomous контур:** VK/Дзен posting (API-ключи + OAuth), AudioAgent (ElevenLabs + WS-прокси на Render). RSS — сделано (session 19).
- **Dedicated `@x10_daily_test_bot`** (сейчас одолжен `@Sekretar_Syrov_IP_bot`; он же → auth-бот Mini App).
- **Домен** x10.media (РФ-доступный DNS).
- **Ротация секретов** через чат (AI Gateway key, TELEGRAM_BOT_TOKEN).
- **Hardening хвост:** Sentry (SENTRY_DSN пуст), S3-аватары, дашборд `pipeline_runs` (теперь данные есть!), recording failed/halted drafts в ledger (сейчас не пишутся).

---

## 5. Стартовый промпт для следующей сессии

> Прочитай (в порядке): `docs/handoffs/handoff-session-20.md` + `handoff-session-19.md` + memory `project_x10_deploy_state.md` + CLAUDE.md. Если трогаем Timeweb-инфру — skill `timeweb-telegram-deploy`.
>
> Состояние: M0 + walking-skeleton ЖИВ и АВТОНОМЕН на Timeweb. Cron `ingest-rss` (*/5, gating 15 мин) → 5 RSS → IngestAgent gate → draft (B2 через AI Gateway) → post-to-tg → «Деловой вестник» (-1003773645085). HEAD `5f8d137`. ⚠️ api.telegram.org только по IPv6 (NAT66). **Дневной $-потолок $15/$9** (budget-gate по pipeline_runs); ops-алерты в логах (TG_OPS_CHAT_ID не задан). Форматирование TG починено.
>
> VM: `ssh root@37.77.105.82`, репо `/opt/x10-daily`, передеплой `./deploy.sh`. НЕ создавай/удаляй VM циклично (Timeweb fraud-detection).
>
> Выбери: (a) задать TG_OPS_CHAT_ID + включить $-алерты в Telegram; (b) VK/Дзен posting; (c) AudioAgent; (d) dedicated @x10_daily_test_bot + auth Mini App; (e) домен x10.media; (f) дашборд pipeline_runs / Sentry.

---

## 6. Ссылки

| Хочешь | Открой |
|---|---|
| Inventory + доступы + грабли | memory `project_x10_deploy_state.md` |
| $-ledger + budget gate | [cost-ledger.ts](../../apps/workers/pipeline/src/lib/cost-ledger.ts), [draft-article.ts](../../apps/workers/pipeline/src/inngest/functions/draft-article.ts) |
| ops-алерты / TG-клиент | [ops-alert.ts](../../apps/workers/pipeline/src/lib/ops-alert.ts), [telegram.ts](../../apps/workers/pipeline/src/lib/telegram.ts) |
| Фикс форматирования | [text.ts](../../apps/workers/pipeline/src/lib/text.ts) |
| Миграция | [0007_cost_alerts.sql](../../packages/db/drizzle/0007_cost_alerts.sql) |
| Предыдущий handoff | [handoff-session-19.md](./handoff-session-19.md) |
