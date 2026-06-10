# Handoff · Session 23 — слот-постинг 4/день + DeepSeek V4 Flash (АКТИВЕН, Claude off)

**Дата:** 9–10 июня 2026
**Что произошло:** Разворот стратегии (не из списка). Три части: (1) **слот-постинг** — управляемый постинг 4/день вместо потока; (2) **смена LLM на DeepSeek** ради экономики; (3) **полное отключение Claude**. Слоты — live. DeepSeek потребовал нетривиального фикса (function-calling валил агентов) → мигрировал ядро `define-agent` на `response_format` → **DeepSeek активирован, Claude отключён**. Логику агентов (FactCheck-halt, цепочку, порог приёма) не трогали.
**Репозиторий:** https://github.com/BIZKON/x10-daily
**HEAD:** `81dce4b` · `origin/main` synced · задеплоено (VM HEAD кода `fe52439`, + хэндофф-коммиты).
**Предыдущий handoff:** [handoff-session-22.md](./handoff-session-22.md) (VK posting). Inventory/доступы/грабли — memory `project_x10_deploy_state.md`.

---

## 0. TL;DR — что ЖИВО ПРЯМО СЕЙЧАС

- **Постинг СЛОТАМИ, не потоком.** `channels` стала очередью; cron **`drain-post-slots`** постит **по 1 статье в слот, 4/день: 09:30 · 12:30 · 15:30 · 18:30 МСК** (= `30 6,9,12,15` UTC). FIFO среди свежих (<24ч), уважает `/posting` (пауза/тихие часы). Бывшие post-to-tg/post-to-vk удалены.
- **Воркер-агенты на DeepSeek (`deepseek/deepseek-chat`), Claude ПОЛНОСТЬЮ отключён.** Все tier'ы (OPUS/SONNET/HAIKU) → `deepseek/deepseek-chat` через env `MODEL_*` в `.env.production`. Ноль вызовов `anthropic/claude-*`. Ожидаемо ~$2-3/день вместо $15.
- **7 Inngest-функций** (было 8: −post-to-tg, −post-to-vk, +drain-post-slots). Миграция **0010**. **162 теста** зелёные, repo typecheck чист.
- ⚠️ Дневной $-потолок $15/$9 не менялся — теперь сильно избыточен для DeepSeek (можно снизить).

---

## 1. Что сделано

### Часть A — слот-постинг (live)
| Файл | Что |
|---|---|
| [channels.ts](../../packages/db/src/schema/channels.ts) + [0010](../../packages/db/drizzle/0010_channels_posting.sql) | `channels` += `posted_at`/`attempts`/`last_error`/`post_ref` + частичный индекс. **Backfill `posted_at=created_at`** старым строкам (иначе репост backlog). journal idx 10. |
| [lib/post-channel.ts](../../apps/workers/pipeline/src/lib/post-channel.ts) | общий send (tg/vk); send и mark разнесены по step'ам (идемпотентность). |
| [drain-post-slots.ts](../../apps/workers/pipeline/src/inngest/functions/drain-post-slots.ts) | cron-дренаж очереди по слотам; posting-control gate; FIFO-fresh выбор; 1 статья/слот. |
| draft-article.ts / app.ts | убраны notify-ready + регистрации post-to-tg/vk; добавлен drain. |

### Часть B — DeepSeek V4 Flash (активен)
| Файл | Что |
|---|---|
| [define-agent.ts](../../packages/agents/src/define-agent.ts) | **provider-conditional structured output**: deepseek → `response_format:{type:"json_object"}` + JSON Schema в system-промпт + парс `message.content`; Claude (не-deepseek) → forced tool_choice как было. |
| [factcheck.ts](../../packages/agents/src/agents/factcheck.ts) | enum-resilience `.catch`: status→`halt` (консервативно), verdict→`unsupported`, confidence→`low`. |
| [zod-to-tool-schema.ts](../../packages/agents/src/zod-to-tool-schema.ts) | nullable → отражает `null` в type (и enum). Иначе схема-в-промпте говорит «non-null», противореча «верни null». |
| [constants.ts](../../packages/config/src/constants.ts) | `MODEL_COSTS["deepseek/deepseek-chat"]` (≈$0.95/$1.89 за 1М — **ОЦЕНКА**, уточнить в LK). |
| [env.ts](../../packages/config/src/env.ts) / [bindings.ts](../../apps/workers/pipeline/src/bindings.ts) | `MODEL_OPUS/SONNET/HAIKU` (default ""); `readBindingsFromEnv` читает их (CRITICAL-фикс — см. §3). |
| [scripts/validate-deepseek-gateway.mjs](../../scripts/validate-deepseek-gateway.mjs) | валид-гейт forced tool_choice (использовался для диагностики thinking-режима). |

---

## 2. DeepSeek: как пришли к рабочему решению (важно понять, прежде чем трогать модели)

1. **DeepSeek оплачен** Константином (раньше был 402).
2. **«Thinking»-варианты `deepseek/deepseek-v4-flash` и `-v4-pro` ОТВЕРГАЮТ forced tool_choice** → `HTTP 400 "Thinking mode does not support this tool_choice"`. На нём держались ВСЕ агенты. → рабочий id — **`deepseek/deepseek-chat`** (= V4 Flash NON-thinking).
3. **`deepseek-chat` через function-calling НЕнадёжен** для крупных вложенных выводов: Draft/Ingest ок, но **ToVAgent системно валил JSON (0/10)** (дописывал текст после JSON). ToV — в цепочке КАЖДОЙ статьи → конвейер бы встал. (Первый наивный флип откатывали.)
4. **Решение: `response_format json_object`** (API гарантирует валидный JSON). PoC 5/5. `json_schema` strict на gateway **НЕДОСТУПЕН** (`HTTP 400 "This response_format type is unavailable now"`) — поэтому json_object + enum-resilience (`.catch`) для соблюдения enum'ов, + nullable-фикс схемы.
5. **Валидация на deepseek-chat (новый код):** main chain **7/7**, ToV **10/10** (было 0/10), FactCheck **10/10** и рассуждает корректно (валидные enum'ы, supported/unsupported по делу — не артефакт `.catch`). Adversarial-review диффа (9 агентов) → 1 MEDIUM (nullable) → исправлен.

**Если будешь добавлять/менять агентов или модели:** DeepSeek идёт через `response_format json_object` (НЕ tool_choice). Новые агенты с строгими enum'ами — добавляй `.catch` (json_object не энфорсит схему; добивает Zod + ретрай Inngest). Цену новой модели — в `MODEL_COSTS`.

---

## 3. ⚠️ Грабли (повторяемые — учти ВСЕ)

- **`docker compose up -d` БЕЗ `--env-file .env.production`** → `${VAR}` пустые → контейнер крашится (нет DATABASE_URL) → **restart-loop**. ВСЕГДА `docker compose --env-file .env.production -f docker-compose.prod.yml ...` или `./deploy.sh`. (Словил при откате; починил.)
- **Новый env-ключ воркера → ОБЯЗАТЕЛЬНО в `readBindingsFromEnv` (bindings.ts).** loadPipelineEnv парсит объект bindings, а НЕ сырой process.env → забытый ключ молча не доходит (так было с MODEL_* — CRITICAL ревью; и раньше с TELEGRAM_PROXY_URL). Регресс: `bindings.test.ts`.
- **Новый/переименованный id Inngest-функции → re-sync `PUT http://pipeline:8787/inngest` из api-контейнера** (НЕ localhost из pipeline). Изменение только КОДА того же id → re-sync не нужен.
- **api.telegram.org из РФ — только IPv6 (NAT66).** Инкапсулировано в `callTelegram`; не трогать.
- Миграции hand-written + journal; `db:generate` НЕ запускать. Бэкапы env на VM: `.env.production.bak.s23`, `.bak.s23b`.
- НЕ создавай/удаляй VM циклично (Timeweb fraud-detection).

---

## 4. Деплой + текущее состояние

- HEAD кода `fe52439` на VM; `MODEL_OPUS/SONNET/HAIKU=deepseek/deepseek-chat` в `.env.production`; 7 контейнеров healthy.
- Live-проверено (вручную, реальный путь env→bindings→modelsFromEnv→агент): `modelUsed=deepseek/deepseek-chat`, ноль Claude.
- Сегодня (9 июня) драфтинг был на паузе с 12:10 МСК ($15.43 Claude-расход исчерпал потолок; алерты warn/exhausted доставлены в личку). **Первый автономный DeepSeek-драфт — на полночном ресете МСК (в ночь на 10 июня).**

---

## 5. Следующая сессия

**ПЕРВЫМ ДЕЛОМ — верифицировать автономный DeepSeek-прогон за ночь** (мои тесты были ручные; нужно подтверждение реального cron-цикла):
- `pipeline_runs` за сегодня МСК: `model_used` = `deepseek/deepseek-chat`? расход резко < $15 (ожидаемо ~$2-3)? сколько успешных draft? нет ли всплеска failed (флакки JSON / enum)?
- Слоты постят? (`channels.posted_at` за сегодня; реальные посты в «Деловой вестник»). Качество постов на DeepSeek (анти-англицизм, ToV, цифры с источниками).
- FactCheck на первых политических статьях — не over-haltит ли (watch-item: лёгкая модель).

**Затем (по выбору Константина):**
- Снизить дневной $-потолок $15→$3-5 (DeepSeek дёшев, аномалии ловить раньше). Env `DAILY_BUDGET_USD`/`WARN`.
- Уточнить реальную цену `deepseek/deepseek-chat` в LK → поправить `MODEL_COSTS`.
- (если качество DeepSeek не устроит на каком-то агенте — точечно вернуть его tier на Claude через `MODEL_*`, или поднять FactCheck на сильнее.)
- Хвост пост-M0: AudioAgent (ElevenLabs+WS-прокси), dedicated `@x10_daily_test_bot` + auth Mini App, домен x10.media, Sentry/S3, LOW-аудит.

### Стартовый промпт для новой сессии

> Прочитай (в порядке): `docs/handoffs/handoff-session-23.md` + memory `project_x10_deploy_state.md` + CLAUDE.md. Timeweb-инфра — skill `timeweb-telegram-deploy`.
>
> Состояние: M0 + walking-skeleton ЖИВ и АВТОНОМЕН на Timeweb. **HEAD кода `fe52439`** (origin/main `81dce4b`). Cron `ingest-rss` (*/5) → RSS → IngestAgent gate → draft → **channels-очередь** → cron `drain-post-slots` постит **4/день (09:30·12:30·15:30·18:30 МСК)** в «Деловой вестник» (-1003773645085). **Воркеры на DeepSeek `deepseek/deepseek-chat`, Claude отключён.** 7 Inngest-функций.
>
> Session 23 итог: (1) слот-постинг (миграция 0010, drain-post-slots, lib/post-channel, удалены post-to-tg/vk); (2) DeepSeek активирован — `define-agent` provider-conditional (deepseek → `response_format json_object`, Claude → tool_choice), FactCheck enum-resilience, nullable-фикс схемы. Рабочая модель — `deepseek/deepseek-chat` (V4 Flash non-thinking; thinking-варианты ломают tool_choice; json_schema на gateway недоступен). 162 теста.
>
> **ЗАДАЧА: сначала верифицируй автономный DeepSeek-прогон за ночь** — `pipeline_runs` сегодня (model_used=deepseek, расход ≪ $15, успешные draft, нет всплеска failed), слоты реально постят, качество постов + FactCheck на политике. Запрос на VM через `docker exec -w /app/apps/workers/pipeline x10-daily-pipeline-1 node --import tsx` (скрипт с `@x10/db` createDb+sql). Затем доложи и предложи: снизить $-потолок ($15→$3-5), уточнить цену Flash в MODEL_COSTS, или хвост пост-M0.
>
> ⚠️ Грабли: деплой/рестарт ТОЛЬКО `docker compose --env-file .env.production ...` или `./deploy.sh` (иначе crash-loop). Новый env-ключ воркера → в `readBindingsFromEnv` (bindings.ts). Новый id Inngest → re-sync `PUT pipeline:8787/inngest` из api. api.telegram.org только IPv6. Откат DeepSeek→Claude — убрать MODEL_* из .env.production + `up -d --env-file` (бэкап `.bak.s23`).
>
> VM: `ssh root@37.77.105.82`, репо `/opt/x10-daily`, передеплой `./deploy.sh`. Режим: многоагентность ВКЛ (Workflow-ревью перед деплоем в живой контур), полная автономия. НЕ пересоздавай VM циклично.

---

## 6. Ссылки

| Хочешь | Открой |
|---|---|
| Inventory + доступы + грабли + DeepSeek-резолюция | memory `project_x10_deploy_state.md` |
| Слот-cron / общий send | [drain-post-slots.ts](../../apps/workers/pipeline/src/inngest/functions/drain-post-slots.ts), [lib/post-channel.ts](../../apps/workers/pipeline/src/lib/post-channel.ts) |
| Provider-conditional агенты | [define-agent.ts](../../packages/agents/src/define-agent.ts), [factcheck.ts](../../packages/agents/src/agents/factcheck.ts), [zod-to-tool-schema.ts](../../packages/agents/src/zod-to-tool-schema.ts) |
| Цены/модели | [constants.ts](../../packages/config/src/constants.ts) (MODEL_COSTS) |
| Валид-гейт DeepSeek | [scripts/validate-deepseek-gateway.mjs](../../scripts/validate-deepseek-gateway.mjs) |
| Миграция | [0010_channels_posting.sql](../../packages/db/drizzle/0010_channels_posting.sql) |
| Предыдущий handoff | [handoff-session-22.md](./handoff-session-22.md) |
