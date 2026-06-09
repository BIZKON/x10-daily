# Handoff · Session 23 — слот-постинг 4/день + env-своп модели на DeepSeek V4 Flash

**Дата:** 9 июня 2026
**Что произошло:** Разворот стратегии (не из списка пост-M0): по запросу Константина — (1) перевести воркер-агентов на более дешёвую **DeepSeek V4 Flash**, оставив FactCheck на Claude; (2) сделать постинг управляемым — **4 поста/день в слоты** вместо потока «каждая принятая статья 24/7». Две независимые части. **Часть A (слоты) задеплоена и ЖИВА.** **Часть B (модель) задеплоена, но ВЫКЛЮЧЕНА** (дефолт=Claude) — ждёт оплаты DeepSeek в LK Timeweb. Перед деплоем — мульти-агентный adversarial review (12 агентов), поймал **CRITICAL** (env-своп модели был бы молчаливым no-op) + MEDIUM, оба исправлены.
**Репозиторий:** https://github.com/BIZKON/x10-daily
**HEAD:** `8804dc4` · `origin/main` synced · задеплоено (VM HEAD `8804dc4`).
**Предыдущий handoff:** [handoff-session-22.md](./handoff-session-22.md) (VK posting). Inventory/доступы — memory `project_x10_deploy_state.md`.

---

## 0. TL;DR — что ЖИВО ПРЯМО СЕЙЧАС

- **Постинг больше НЕ потоковый.** Раньше каждая принятая статья постилась немедленно (article.ready → post-to-tg). Теперь `channels` — **очередь**, а новый cron **`drain-post-slots`** выдаёт **по 1 статье в каждый из 4 слотов**: **09:30 · 12:30 · 15:30 · 18:30 МСК** (= `30 6,9,12,15 * * *` UTC). Выбор: FIFO среди свежих (<24ч), уважает `/posting` (пауза/тихие часы).
- **Модель воркеров — пока Claude (дефолт).** Инфраструктура для свопа на DeepSeek V4 Flash задеплоена, но **DeepSeek на gateway сейчас 402** (не оплачен) → дефолт оставлен Claude, чтобы не положить конвейер. **Поведение LLM не изменилось.**
- **7 Inngest-функций** (было 8: −post-to-tg, −post-to-vk, +drain-post-slots).
- Миграция **0010** (channels-очередь). 159 тестов зелёные (pipeline 106), repo typecheck чист.
- **Слот-постинг проверен LIVE:** ручной прогон real-handler `drain-post-slots` (прод DB+TG, IPv6) запостил статью в «Деловой вестник» — `message_id 136`, `posted_at`+`status=published`. Cron-firing на слоте — подтверждает фоновый монитор.
- **⚠️ UPDATE (позже в session 23): DeepSeek активация ПОПРОБОВАНА (после оплаты) и ОТКАЧЕНА.** Рабочий id — `deepseek/deepseek-chat` (V4 Flash non-thinking; thinking-варианты → HTTP 400 на forced tool_choice). Но deepseek-chat function-calling **системно валит ToVAgent (0/10)** на крупном вложенном выводе → конвейер бы встал. Откат на Claude, прод healthy. Жизнеспособный DeepSeek требует миграции define-agent на `response_format json_object`. Детали — memory `project_x10_deploy_state.md` + §4 ниже частично устарел (флип env недостаточен без фикса).

---

## 1. Что изменилось (коммит `8804dc4`)

### Часть A — слот-постинг (АКТИВНА)
| Файл | Что |
|---|---|
| [channels.ts](../../packages/db/src/schema/channels.ts) + [0010](../../packages/db/drizzle/0010_channels_posting.sql) | `channels` += `posted_at`/`attempts`/`last_error`/`post_ref` + частичный индекс `channels_pending_idx`. **Backfill `posted_at=created_at`** старым строкам (иначе репост backlog'а). journal idx 10. |
| [lib/post-channel.ts](../../apps/workers/pipeline/src/lib/post-channel.ts) | **новый** — `sendToChannel` (чистый send tg/vk), `markChannelPosted`, `recordChannelFailure`. Send БЕЗ записи в БД → drain разносит send/mark по разным step'ам. |
| [drain-post-slots.ts](../../apps/workers/pipeline/src/inngest/functions/drain-post-slots.ts) | **новый** cron. posting-control gate → select 1 непостнутую tg-строку (FIFO, свежесть <24ч) → postChannelRow(tg)+(vk если конфиг) → `articles.status='published'`. conc 1, retries 1. |
| [draft-article.ts](../../apps/workers/pipeline/src/inngest/functions/draft-article.ts) | убраны 2 `step.sendEvent("notify-ready"...)` — постинг расцеплён; channels-вставки tg/vk ОСТАЛИСЬ (это очередь). |
| app.ts | −createPostToTg/Vk, +createDrainPostSlots. **post-to-tg.ts / post-to-vk.ts УДАЛЕНЫ.** |
| тесты | drain-post-slots (5), post-channel (8), e2e + draft-article под новый flow. |

### Часть B — env-своп модели (ВЫКЛ по умолчанию)
| Файл | Что |
|---|---|
| [constants.ts](../../packages/config/src/constants.ts) | `MODEL_COSTS` (цена по model-id) + `deepseek/deepseek-v4-flash`/`-pro`. ⚠️ Цена Flash — **ОЦЕНКА** (~$0.95/$1.89 за 1М; LK V4 Pro = 234.9/469.8 ₽/М, Flash ≈ 0.32×). **Подтвердить в LK.** |
| [env.ts](../../packages/config/src/env.ts) | `MODEL_OPUS`/`MODEL_SONNET`/`MODEL_HAIKU` (default `""`); заменили мёртвые `ANTHROPIC_MODEL_*`. |
| [define-agent.ts](../../packages/agents/src/define-agent.ts) | `model = ctx.models?.[tier] \|\| MODELS[tier]`; `costUsd = calculateCostUsd(tier, usage, model)`. |
| [cost.ts](../../packages/agents/src/cost.ts) | `calculateCostUsd(tier, usage, modelId?)` → `MODEL_COSTS[modelId] ?? COST_PER_MTOK[tier]` + warn. |
| [lib/agent-context.ts](../../apps/workers/pipeline/src/lib/agent-context.ts) | **новый** `modelsFromEnv(env)` — подключён на 4 call-site (draft/process/score/newsletter). |
| [bindings.ts](../../apps/workers/pipeline/src/bindings.ts) + server.ts | `readBindingsFromEnv` (вынесена из server.ts, тестируемая) + MODEL_* (см. §2 CRITICAL). |
| docker-compose.prod.yml / .env.example | MODEL_* проброшены в pipeline + задокументированы. |
| [scripts/validate-deepseek-gateway.mjs](../../scripts/validate-deepseek-gateway.mjs) | **новый** валид-гейт (forced tool_choice × reasoning) — запуск на VM до включения. |

---

## 2. ⚠️ Adversarial review поймал CRITICAL + MEDIUM (12 агентов, 7 raw → 2 confirmed)

1. 🔴 **CRITICAL — env-своп модели был бы молчаливым no-op.** `readBindings()` в server.ts (единственная рантайм-точка сбора bindings) собирала env поле-за-полем, но **НЕ читала MODEL_***. compose кидает их в `process.env`, но `loadPipelineEnv` парсит ИМЕННО объект bindings (не сырой env) → MODEL_* отсутствуют → `.default("")` → `modelsFromEnv`={} → все агенты на Claude. Оператор бы выставил `MODEL_SONNET=deepseek/...`, передеплоил — и НИЧЕГО (платил бы за Claude, думая, что на DeepSeek). Type-invisible (каст `as Record`) + test-invisible. **Тот же класс бага уже кусал `TELEGRAM_PROXY_URL`** (audit M2). **Фикс:** вынес в `readBindingsFromEnv` (bindings.ts, side-effect-free) + MODEL_* + **регресс-тест** [bindings.test.ts](../../apps/workers/pipeline/test/bindings.test.ts) на весь класс.
2. 🟡 **MEDIUM — TG-постинг at-least-once (редкий дубль).** Разнесение send/mark защищает только «send успел, упал ПОСЛЕДУЮЩИЙ шаг». Если **сам send бросит ПОСЛЕ сетевой записи** (read-таймаут IPv6 / краш) → Inngest переисполнит send (retries:1) → дубль (у sendMessage нет ключа идемпотентности; у VK есть guid-дедуп). **Решение:** принятый риск (окно узкое, ретрай ценнее молчаливой потери; так же вёл себя старый post-to-tg) + честно поправлены переобещавшие комменты.

**Урок (снова, как session 22):** review мультиагентом перед деплоем фичи в живой контур окупился — CRITICAL сделал бы часть B мёртвой молча.

---

## 3. Деплой + верификация (session 23)

- push → `./deploy.sh` (git pull + build pipeline + **миграция 0010** + up -d). VM HEAD `8804dc4`, контейнеры healthy.
- ⚠️ **re-sync ОБЯЗАТЕЛЕН** (новый id `drain-post-slots` + удалённые post-to-tg/vk): `PUT http://pipeline:8787/inngest` из **api**-контейнера → `200 {"Successfully registered","modified":true}`.
- Верифицировано live:
  - Inngest-сервер: `functionCount=7`, app-url `http://pipeline:8787/inngest` (post-to-tg/vk сняты, drain есть).
  - Миграция 0010: колонки + `channels_pending_idx` на месте; **backfill корректен** — 131 строка, pending=1, и эта 1 создана 10:56 UTC (свежая, ПОСЛЕ миграции); 130 исторических помечены posted → **репоста backlog'а нет**.
  - **Слот-постинг подтверждён LIVE:** ручной прогон real-handler `drain-post-slots` (прод DB + реальный TG по IPv6) запостил статью `2895b87d` (порт в Архангельске, Forbes) в «Деловой вестник» — `send-tg ok message_id=136`, `channels.posted_at` + `articles.status=published` (11:16 UTC). Дубля нет (posted_at исключает из следующего select). Cron-расписание зарегистрировано; фактический firing на слоте 12:30 UTC подтверждает фоновый монитор.

---

## 4. ⚠️ Как ВКЛЮЧИТЬ часть B (DeepSeek V4 Flash) — действия Константина + следующей сессии

1. **Оплатить/заказать DeepSeek в LK Timeweb** (сейчас `402 Insufficient funds` на DeepSeek-моделях; Claude оплачен). На скрине LK — кнопка «Заказать» для агента V4 Pro.
2. **Прогнать валид-гейт на VM** (V4 Flash — reasoning-модель, риск: reasoning съест max_tokens до tool_call):
   ```
   cd /opt/x10-daily && set -a && . ./.env.production && set +a && \
     node scripts/validate-deepseek-gateway.mjs deepseek/deepseek-v4-flash
   ```
   PASS → tool_call заполнен, enum ок, в таймаут. FAIL → поднять `VALIDATE_MAX_TOKENS` / non-thinking-вариант ДО включения.
3. **Включить:** в `.env.production` задать `MODEL_SONNET=deepseek/deepseek-v4-flash` + `MODEL_HAIKU=deepseek/deepseek-v4-flash` (OPUS не трогать — FactCheck на Claude) → `docker compose -f docker-compose.prod.yml up -d pipeline`.
4. **Проверить, что свап реально доехал:** в первой драфт-статье `pipeline_runs.model_used` / логах = `deepseek/deepseek-v4-flash` (CRITICAL из §2 — env-plumbing был type/test-invisible). Подтвердить качество поста (анти-англицизм, ToV) + $-ledger (резко дешевле).
5. **Уточнить цену Flash** в LK и поправить `MODEL_COSTS["deepseek/deepseek-v4-flash"]` (сейчас оценка).

---

## 5. Осталось (пост-M0)

- **Часть B активация** (см. §4) — как DeepSeek оплатят.
- **AudioAgent** (ElevenLabs + WS-прокси Render). **Dzen** posting (нет API). **Dedicated `@x10_daily_test_bot`** + auth Mini App. **Домен** x10.media. **Sentry** / **S3-аватары**.
- **Хвост LOW** из аудитов (L1/L2/L3, soft-cap doc) + (опц.) усиление слот-выбора (SQL-фильтр FIFO/свежесть НЕ покрыт юнит-тестами — мок обходит where; проверяется живьём).

---

## 6. Стартовый промпт для следующей сессии

> Прочитай (в порядке): `docs/handoffs/handoff-session-23.md` + `handoff-session-22.md` + memory `project_x10_deploy_state.md` + CLAUDE.md. Если трогаем Timeweb-инфру — skill `timeweb-telegram-deploy`.
>
> Состояние: M0 + walking-skeleton ЖИВ и АВТОНОМЕН на Timeweb. **HEAD `8804dc4`.** Cron `ingest-rss` (*/5) → RSS → IngestAgent gate → draft (Claude через Timeweb AI Gateway) → **channels-очередь** → cron `drain-post-slots` постит **4/день (09:30·12:30·15:30·18:30 МСК)** в «Деловой вестник» (-1003773645085). **7 Inngest-функций.** ⚠️ api.telegram.org только IPv6 (NAT66).
>
> Session 23 итог: **слот-постинг** (channels стала очередью, миграция 0010 + backfill, drain-post-slots cron, lib/post-channel.ts, удалены post-to-tg/vk) + **env-своп модели на DeepSeek V4 Flash** (MODEL_SONNET/HAIKU, дефолт=Claude, gated на оплату DeepSeek — сейчас 402). Adversarial review (12 агентов) поймал CRITICAL (MODEL_* не читались в readBindings → своп был бы no-op; вынес в тестируемую readBindingsFromEnv + регресс-тест) + MEDIUM (TG at-least-once — принятый риск). 159 тестов.
>
> ⚠️ ВКЛЮЧИТЬ DeepSeek (когда оплачен): валид-гейт `node scripts/validate-deepseek-gateway.mjs` на VM → `MODEL_SONNET/HAIKU=deepseek/deepseek-v4-flash` в .env.production → up -d pipeline → проверить `pipeline_runs.model_used`. Цена Flash в MODEL_COSTS — оценка, уточнить в LK.
> ⚠️ Новый/переименованный id Inngest-функции → re-sync `PUT http://pipeline:8787/inngest` из api-контейнера ОБЯЗАТЕЛЕН (НЕ localhost из pipeline). ⚠️ Любой новый env-ключ воркера добавлять в `readBindingsFromEnv` (bindings.ts) — иначе не доедет (regress: bindings.test.ts).
>
> VM: `ssh root@37.77.105.82`, репо `/opt/x10-daily`, передеплой `./deploy.sh`. НЕ создавай/удаляй VM циклично.
>
> Выбери: (a) включить DeepSeek live (когда оплачен) + проверить качество/$; (b) AudioAgent; (c) dedicated бот + auth Mini App; (d) домен x10.media; (e) Sentry / S3; (f) хвост LOW аудита.

---

## 7. Ссылки

| Хочешь | Открой |
|---|---|
| Inventory + доступы + грабли | memory `project_x10_deploy_state.md` |
| Слот-cron | [drain-post-slots.ts](../../apps/workers/pipeline/src/inngest/functions/drain-post-slots.ts) |
| Общий send | [lib/post-channel.ts](../../apps/workers/pipeline/src/lib/post-channel.ts) |
| Env-своп модели | [agent-context.ts](../../apps/workers/pipeline/src/lib/agent-context.ts), [define-agent.ts](../../packages/agents/src/define-agent.ts), [constants.ts](../../packages/config/src/constants.ts) |
| Валид-гейт DeepSeek | [scripts/validate-deepseek-gateway.mjs](../../scripts/validate-deepseek-gateway.mjs) |
| Миграция | [0010_channels_posting.sql](../../packages/db/drizzle/0010_channels_posting.sql) |
| Предыдущий handoff | [handoff-session-22.md](./handoff-session-22.md) |
