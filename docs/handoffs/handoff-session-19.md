# Handoff · Session 19 — Multi-source RSS ingest (расширение autonomous контура, пункт C)

**Дата:** 4 июня 2026
**Что произошло:** Продолжение session 18 в том же чате. После того как walking-skeleton ожил на одном источнике (vc.ru), обобщил ingest в **data-driven multi-source** конвейер: cron читает источники из таблицы `sources` и перебирает все `enabled`. Засеяно и запущено **5 RSS-источников**. Проверено живьём.
**Репозиторий:** https://github.com/BIZKON/x10-daily
**HEAD:** `d1fb0f4` (+ этот handoff) · `origin/main` synced · working tree clean.
**Предыдущий handoff:** [handoff-session-18.md](./handoff-session-18.md) (walking-skeleton ЖИВ; 4 латентных бага + IPv6/NAT66). Полный inventory/доступы — memory `project_x10_deploy_state.md`.

---

## 0. TL;DR — что ЖИВО ПРЯМО СЕЙЧАС

- Всё из session 18 (7 контейнеров, HTTPS, AI Gateway, Inngest, IPv6/NAT66, post-to-tg в «Деловой вестник»).
- **НОВОЕ: автопостинг тянет из 5 RSS-источников** (было 1). Cron `ingest-rss` каждые 5 мин → COMPLETED, перебирает все enabled RSS из таблицы `sources`.
- Источники (data-driven, не хардкод): **vc.ru · Forbes.ru · Коммерсантъ-экономика · РБК · Habr**.
- Проверено: cron COMPLETED, все 5 фидов тянутся из контейнера, РБК за тик поймал 4 свежих item'а (dedup отметил, флуда нет), per-source ошибок нет.

---

## 1. Что изменилось (коммит `d1fb0f4`)

| Было | Стало |
|---|---|
| `fetchVcRss(opts)` (хардкод vc.ru) | **`fetchRss(url, opts)`** generic (`fetch-vc.ts` → `fetch-rss.ts`) |
| — | **`listEnabledRssSources(db)`** в `@x10/worker-ingest` — читает `sources WHERE enabled AND kind='rss'` |
| `ingest-vc-rss` (1 источник) | **`ingest-rss`** — перебирает все enabled RSS, по каждому fetch+dedup+emit с `publisher=source.name` |
| — | `scripts/seed-sources.sql` (идемпотентный засид 4 фидов) |
| — | `ingest-rss.test.ts` (multi-source emit, изоляция битого источника, кап) |

**Ключевые решения:**
- **Изоляция:** fetch+mark каждого источника — отдельный Inngest-step с try/catch внутри → битый источник (timeout/404/406/parse) НЕ роняет остальные (логируется `console.warn`, summary.perSource[].error).
- **Кап `MAX_EMIT_PER_SOURCE=25`/источник/тик** — страховка от бурста (catch-up после простоя). Глобальный потолок $ — `draft-article` rateLimit 50/час.
- **Один step на источник** для fetch+mark (Inngest мемоизирует → markIfNew не повторяется при ретрае). Свежие items возвращаются и эмитятся отдельными `sendEvent`.
- `poll_interval_sec`/`last_polled_at` пока НЕ используются — поллим все enabled каждый тик (future-оптимизация: gating по интервалу, чтобы не дёргать firehose-фиды каждые 5 мин).

---

## 2. ⚠️ Грабли (НЕ наступить снова)

1. **Анти-флуд обязателен при добавлении источника.** `seen_items` дедупит по `(source_id, external_id)`. Новый источник без прайминга → первый тик cron'а считает ВЕСЬ фид свежим → флуд (Haiku-гейт на каждый + принятые в draft по $0.45). **Перед включением нового источника примить:** fetch фид → `\copy` всех externalId в `seen_items` для его `source_id`. Все 5 текущих приминены (~142 seen_items).
2. **Коммерсантъ → HTTP 406** на `Accept: application/rss+xml, application/xml` БЕЗ `*/*`. `fetchRss` шлёт `…q=0.9, */*; q=0.8` → 200/44 items. Если курлишь вручную (прайминг) — добавляй `*/*` или убирай Accept, иначе получишь 406 (HTML-страницу, не XML).
3. **Прайминг-скрипт:** при parse-ошибке источника НЕ переиспользуй stale `/tmp/extids.txt` от предыдущего источника (этим я один раз залил Коммерсанту чужие externalId — почистил `DELETE FROM seen_items WHERE source_id=…` + переприминил). Чисти временный файл между источниками.
4. **Смена `id` Inngest-функции требует re-sync.** Переименование `ingest-vc-rss` → `ingest-rss` (новый slug) Inngest не подхватил автоматически после recreate — старый slug висел, новый не регистрировался. Фикс: `PUT http://pipeline:8787/inngest` (из api-контейнера) → `"Successfully registered, modified:true"`. Смена только КОДА функции (тот же id) re-sync НЕ требует.

---

## 3. Источники (таблица `sources`, все enabled+primed)

| name | url | items | заметка |
|---|---|---|---|
| vc.ru | https://vc.ru/rss | 12 | startup/practice |
| Forbes.ru | https://www.forbes.ru/newrss.xml | 14 | бизнес/деньги |
| Коммерсантъ | https://www.kommersant.ru/rss/section-economics.xml | 44 | экономика/власть (нужен `*/*` Accept) |
| РБК | https://rssexport.rbc.ru/rbcnews/news/30/full.rss | 30 | бизнес/власть (общая лента) |
| Habr | https://habr.com/ru/rss/news/?fl=ru | 40 | tech |

Исключены firehose ТАСС (100)/Ведомости (200) — много оффтопа → пустые гейт-вызовы. Добавить источник = строка в `sources` (или `scripts/seed-sources.sql`) + прайминг. Отключить = `UPDATE sources SET enabled=false` (без кода/деплоя).

---

## 4. Деплой/проверка (как делал)

- Код: правка → `pnpm typecheck` + `pnpm test` (pipeline 26/26) → commit → push → на VM `git pull` + `docker compose build pipeline` + `up -d pipeline`.
- **После смены id функции:** `PUT /inngest` для re-sync (см. §2.4).
- Засид: `psql "$DATABASE_URL" -f scripts/seed-sources.sql` + прайминг каждого нового источника.
- Проверка cron'а: ждать тик `*/5`, статус run через GraphQL `runs(first:N, orderBy:[{field:QUEUED_AT,direction:DESC}], filter:{from:"<ISO>"})`; логи `docker compose logs pipeline | grep ingest-rss`; рост `seen_items` per source.

---

## 5. Осталось (пост-M0)

- **Autonomous контур:** VK/Дзен posting (нужны API-ключи + OAuth), AudioAgent (ElevenLabs заблокирован в РФ → WS-прокси на Render + аккаунт). RSS-источники — СДЕЛАНО.
- **Dedicated `@x10_daily_test_bot`** (сейчас одолжен `@Sekretar_Syrov_IP_bot`; он же → auth-бот Mini App).
- **Домен** x10.media (РФ-доступный DNS).
- **Ротация секретов** через чат (AI Gateway key, TELEGRAM_BOT_TOKEN).
- **$-мониторинг/алерты:** cron крутится 24/7 на 5 источниках, ~$0.001/item гейт + ≤50 draft/час × $0.45. Полезно: алерт на дневной расход + дашборд `pipeline_runs`.
- **poll_interval_sec gating** — чтобы не поллить все источники каждые 5 мин (когда добавятся firehose-фиды).

---

## 6. Стартовый промпт для следующей сессии

> Прочитай (в порядке): `docs/handoffs/handoff-session-19.md` + `handoff-session-18.md` + memory `project_x10_deploy_state.md` + CLAUDE.md. Если трогаем Timeweb-инфру — skill `timeweb-telegram-deploy`.
>
> Состояние: M0 + walking-skeleton ЖИВ в проде на Timeweb. Автопостинг автономен: cron `ingest-rss` (*/5) тянет 5 RSS-источников → IngestAgent gate → draft (B2 через Timeweb AI Gateway) → post-to-tg → реальный пост в TG-канал «Деловой вестник» (-1003773645085). HEAD `d1fb0f4`+. ⚠️ api.telegram.org только по IPv6 (NAT66 настроен). Cron постит ~$0.45/принятая статья, 24/7.
>
> VM: `ssh root@37.77.105.82` (ключ без passphrase), репо `/opt/x10-daily`, передеплой `./deploy.sh` (или таргетно `build pipeline` + `up -d pipeline`). НЕ создавай/удаляй VM циклично (Timeweb fraud-detection).
>
> Выбери задачу: (a) VK/Дзен posting (новые post-функции, нужны API-ключи); (b) AudioAgent (ElevenLabs + WS-прокси на Render); (c) dedicated `@x10_daily_test_bot` + миграция auth Mini App; (d) пост-M0 hardening ($-мониторинг/алерты на cron, S3 аватары, Sentry, ротация секретов, poll_interval gating для источников); (e) домен x10.media.

---

## 7. Ссылки

| Хочешь | Открой |
|---|---|
| Inventory + доступы + грабли | memory `project_x10_deploy_state.md` |
| Walking-skeleton история (4 бага + IPv6) | [handoff-session-18.md](./handoff-session-18.md) |
| Multi-source ingest | [ingest-rss.ts](../../apps/workers/pipeline/src/inngest/functions/ingest-rss.ts), [fetch-rss.ts](../../apps/workers/ingest/src/fetch-rss.ts), [dedupe.ts](../../apps/workers/ingest/src/dedupe.ts) |
| Засид источников | [scripts/seed-sources.sql](../../scripts/seed-sources.sql) |
| Timeweb грабли | skill `timeweb-telegram-deploy` |
