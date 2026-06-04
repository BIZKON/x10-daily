# Handoff · Session 18 — Walking-skeleton ЖИВ (vc.ru → AI → Telegram замкнут)

**Дата:** 4 июня 2026
**Что произошло:** Взяли задачу (a) — dedicated TG-постинг. По ходу выяснилось, что **walking-skeleton НИКОГДА не работал**: автономный контур падал на каждом тике 15 часов, молча (контейнеры healthy, функции зарегистрированы, но каждый запуск умирал внутри). Вскрыли и закрыли **4 латентных бага** (каждый блокировал всё ниже по конвейеру) + 1 инфра-блокер (IPv6). Итог: **полный контур vc.ru → IngestAgent → DraftAgent(B2, 8 агентов) → channels → post-to-tg → реальный sendMessage в Telegram-канал работает.**
**Репозиторий:** https://github.com/BIZKON/x10-daily
**HEAD:** `3ea91a5` · `origin/main` synced · working tree clean.
**Предыдущий handoff:** [handoff-session-17.md](./handoff-session-17.md) (HEAD был `538aa4b`).

---

## 0. TL;DR — что ЖИВО ПРЯМО СЕЙЧАС

- M0-инфра как была (7 контейнеров, HTTPS, pgvector, AI Gateway, Inngest 6 функций).
- **НОВОЕ: автономный конвейер постит.** Cron `ingest-vc-rss` (каждые 5 мин) → COMPLETED, тащит свежие vc.ru-материалы → AI-цепочка → пост в канал.
- **Тестовый канал: «Деловой вестник» `@delovoy_vestnik`, chat_id `-1003773645085`.** Бот = `@Sekretar_Syrov_IP_bot` (id 8189028690, ОДОЛЖЕН — не dedicated, админ канала).
- Проверено end-to-end: статья про Volga (60 млрд ₽ локализация) сгенерена в Smart Brevity (Tease/Why/Numbers с атрибуцией vc.ru/Yes-but/What's-next) и запостена (`post-to-tg` run = COMPLETED).
- ⚠️ **Конвейер теперь постит АВТОНОМНО** каждый qualifying новый vc.ru-item (~$0.45/статья). Следить за $ или ставить cron на паузу.

---

## 1. 4 бага — почему walking-skeleton никогда не работал

Все — один класс: **prod-путь (`NODE_ENV=production`) не покрывался тестами** (всё шло под `NODE_ENV="test"`, где prod-ветки не исполняются). К каждому фиксу добавлен регрессионный тест на prod-поведение.

| # | SHA | Баг | Симптом | Фикс |
|---|---|---|---|---|
| 1 | `2124daf` | Все 6 Inngest-функций звали bare `loadEnv(bindings)` без per-service `requiredKeys` → падали на «missing X10_JWT_SECRET» (воркер JWT не выпускает, ключ ему не маппится). Фикс `e7897e2` (s17) жил в мёртвом `getPipelineEnv()`. | cron 15h: `seen_items=0`, `articles=0` | `loadPipelineEnv()` (non-caching) + `PIPELINE_REQUIRED_KEYS`; все функции через него |
| 2 | `a4cb998` | `createMasker` fail-closed в проде при пустом `MASKER_*`, хотя решение s14 (Timeweb AI Gateway → ПДн в РФ → маскировка не нужна) применили к env, но не к `createMasker`. | `process-source-item` падал `MaskerUnconfiguredError` до первого агента | passthrough при `AI_GATEWAY_API_KEY` (fail-closed только для Anthropic direct) |
| 3 | `a08b6e2` | Timeweb Gateway (OpenAI→Anthropic tool-перевод) НЕ строго энфорсит enum'ы. IngestAgent вернул `category`/`template` вне enum → ZodError рушил конвейер (промпт перечисляет токены, схема несёт enum — модель всё равно отклонилась). | `draft`/`process` падали ZodError | `.catch` на advisory-enum'ах (ingest category/template/rejectReason, hookgen pattern, score criterion, social channel/framework). Критичные (decision, factcheck halt) — строгие. `zodToToolSchema` учит unwrap `.catch` (enum-hint сохраняется) |
| 4 | `3ea91a5` | `api.telegram.org` из РФ-сети доступен **ТОЛЬКО по IPv6** (IPv4 149.154.x фильтруется — `curl -4` с хоста → timeout 9s). Docker-bridge IPv4-only → контейнер forced на IPv4 → `post-to-tg` ETIMEDOUT. | весь LLM-конвейер отрабатывал, пост не уходил | `enable_ipv6` на default-сети + NAT66 (Docker 29 ip6tables on) + host sysctl (см. §2) |

---

## 2. ⚠️ Инфра-нюанс IPv6 (НЕ забыть при пересоздании VM/сети)

`api.telegram.org` в РФ — **только IPv6**. Чтобы контейнеры доставали Telegram:

1. **docker-compose.prod.yml** → `networks: default: enable_ipv6: true`. Docker 29 (`ip6tables` on by default) авто-выдаёт ULA-подсеть + NAT66 (masquerade в хостовый IPv6). Контейнер pipeline получает `fdf0:...`.
2. **Хост** (`/etc/sysctl.d/99-x10-ipv6.conf`, persist):
   ```
   net.ipv6.conf.eth0.accept_ra=2   # СНАЧАЛА — иначе forwarding снесёт RA-маршрут eth0
   net.ipv6.conf.all.forwarding=1
   ```
   Порядок важен: без `accept_ra=2` включение forwarding убивает IPv6-default-route хоста → NAT66 некуда выходить.
3. Применение требует `docker compose down && up -d` (пересоздание сети). Проверка: `docker inspect x10-daily-pipeline-1 --format '{{range .NetworkSettings.Networks}}{{.GlobalIPv6Address}}{{end}}'` → не пусто; из контейнера `fetch(api.telegram.org/.../getMe)` → 401.

`TELEGRAM_PROXY_URL` **не нужен** (IPv6 решает напрямую). Прокси-путь из skill — на случай если IPv6 недоступен.

---

## 3. Как триггерить/проверять конвейер вручную

- Inngest event API доступен ТОЛЬКО изнутри docker-сети (8288 не опубликован на хост). Слать через node в api-контейнере:
  ```
  printf '<event-json>' | docker compose ... exec -T api node -e '<читает stdin → POST http://inngest:8288/e/$INNGEST_EVENT_KEY>'
  ```
- События: `source.item.received` (полная цепочка через IngestAgent gate) или `article/topic.ingested` (минуя gate) или `article.ready{articleId,channel:tg}` (только post-to-tg для готовой статьи).
- ⚠️ **IngestAgent отклоняет тонкие item'ы** (без конкретных чисел/атрибуции) — это правильно. Для теста happy-path нужен item с числом + бизнес-углом (vc.ru RSS-сниппеты часто тонкие → reject).
- Статусы runs: GraphQL `runs(first:N, orderBy:[{field:QUEUED_AT,direction:DESC}], filter:{from:"<ISO>"})` → `edges{node{status function{slug} output}}`.
- **Бот не видит свои же channel_post в getUpdates** — для подтверждения поста смотреть run-статус post-to-tg = COMPLETED или сам канал.

---

## 4. seen_items приминены (анти-флуд)

После фикса #1 первый успешный тик cron'а увидел бы ВЕСЬ текущий feed как свежий → 12 статей × $0.45 + флуд в канал. Поэтому seen_items приминены 12 текущими vc.ru-items (через psql `\copy`, source_id `3333…`). Дальше cron эмитит только ГЕНУИННО новые items. Сейчас seen_items=13 (cron уже поймал 1 новый, gate отклонил).

---

## 5. Что осталось (пост-M0, не блокеры)

1. **Dedicated `@x10_daily_test_bot`** — сейчас одолжен `@Sekretar_Syrov_IP_bot` (он же станет auth-ботом Mini App). Не блокирует постинг.
2. **Домен** x10.media (РФ-доступный DNS / Timeweb).
3. **Ротация секретов** через чат: AI Gateway key, TELEGRAM_BOT_TOKEN.
4. **Мониторинг $** автономного постинга (cron жив 24/7, ~$0.45/принятая статья).
5. S3/Resend/PostHog/Sentry — пустые, задать по надобности.
6. Расширение autonomous контура: ещё RSS-источники, VK/Дзен posting, AudioAgent.

---

## 6. Стартовый промпт для следующей сессии

> Прочитай `docs/handoffs/handoff-session-18.md` + memory `project_x10_deploy_state.md`. M0 + walking-skeleton ЖИВ: cron vc.ru → AI → реальный пост в канал «Деловой вестник» (-1003773645085). HEAD `3ea91a5`. ⚠️ api.telegram.org только по IPv6 (NAT66 настроен; sysctl accept_ra=2+forwarding). Конвейер постит автономно (~$0.45/статья).
>
> Выбери: (a) dedicated @x10_daily_test_bot + миграция auth Mini App; (b) домен x10.media; (c) расширение autonomous (VK/Дзен, ещё источники, AudioAgent); (d) пост-M0 hardening (S3, Sentry, ротация секретов, $-мониторинг/алерты на cron).

---

## 7. Ссылки

| Хочешь | Открой |
|---|---|
| Актуальный inventory + доступы | memory `project_x10_deploy_state.md` |
| Timeweb грабли | skill `timeweb-telegram-deploy` |
| Prod compose (теперь с enable_ipv6) | [docker-compose.prod.yml](../../docker-compose.prod.yml) |
| Pipeline env-loader | [apps/workers/pipeline/src/env.ts](../../apps/workers/pipeline/src/env.ts) |
| Masker | [packages/agents/src/masker.ts](../../packages/agents/src/masker.ts) |
| Предыдущий handoff | [handoff-session-17.md](./handoff-session-17.md) |
