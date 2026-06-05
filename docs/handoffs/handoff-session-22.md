# Handoff · Session 22 — VK posting (расширение autonomous-контура на VK-стену)

**Дата:** 5 июня 2026
**Что произошло:** Взял задачу (b) — VK posting. Расширил автопостинг на стену VK-сообщества (reach → DAU). Архитектура уже была VK-ready (channelKind enum, articleReadyEvent channel='vk', channels one-row-per-channel, SocialAmplifyAgent с правилами vk) — добавил недостающий путь: VK-клиент + post-функцию + генерацию VK-варианта в draft-article + env во всех слоях. **Перед деплоем прогнал мульти-агентный adversarial review** (16 агентов) — он поймал **CRITICAL deploy-breaker** (пустая строка VK_OWNER_ID крашила весь воркер); исправил + ещё 4 находки. Задеплоено, VK выключен по умолчанию (деплой не меняет поведение прода), верифицировано live.
**Репозиторий:** https://github.com/BIZKON/x10-daily
**HEAD:** `d2ad629` (+ этот handoff) · `origin/main` synced · задеплоено (VM HEAD `d2ad629`).
**Предыдущий handoff:** [handoff-session-21.md](./handoff-session-21.md) (M4 надёжная дослыка ops-алертов). Inventory/доступы — memory `project_x10_deploy_state.md`.

---

## 0. TL;DR — что ЖИВО ПРЯМО СЕЙЧАС

- Всё из session 21 (8 контейнеров… теперь **8 Inngest-функций**: +post-to-vk; $-потолок, /cost, /posting, M4-дослыка, 5 RSS).
- **НОВОЕ: VK-ветка автопостинга — задеплоена, но ВЫКЛЮЧЕНА** (VK_ACCESS_TOKEN/VK_OWNER_ID пусты). При выкл: draft-article не генерит VK-вариант (лишний Sonnet не тратится), post-to-vk скипает. **Поведение прода не изменилось.**
- **Чтобы ВКЛЮЧИТЬ:** задать `VK_ACCESS_TOKEN` (community/user token, scope `wall,groups,offline`) + `VK_OWNER_ID` (id стены, отрицательный для сообщества, напр `-123456789`) в `.env.production` → `docker compose -f docker-compose.prod.yml up -d pipeline`. Активируется автоматически.
- VK API РФ-доступен по обычному HTTPS — **ни IPv6, ни прокси** (в отличие от Telegram).
- 96/96 тестов, repo-wide typecheck чист.

---

## 1. Что изменилось (коммит `d2ad629`)

| Файл | Что |
|---|---|
| [lib/vk.ts](../../apps/workers/pipeline/src/lib/vk.ts) | **новый** — клиент `wall.post`. `VkApiError{code}` + `NON_RETRYABLE_VK_CODES`. guid-идемпотентность. HTTP-status check. |
| [post-to-vk.ts](../../apps/workers/pipeline/src/inngest/functions/post-to-vk.ts) | **новая** Inngest-функция на article.ready(vk). Уважает /posting. Без VK-конфига скипает (не бросает). |
| [draft-article.ts](../../apps/workers/pipeline/src/inngest/functions/draft-article.ts) | при VK-конфиге: VK-вариант (SocialAmplifyAgent channel='vk') → $-ledger → channels(vk) → article.ready(vk). Без VK — ветка ВЫКЛ. |
| [env.ts](../../packages/config/src/env.ts) | VK_ACCESS_TOKEN + VK_OWNER_ID (union с literal("") — см. §2). |
| bindings.ts / server.ts / docker-compose.prod.yml / .env.example | проброс VK env во всех слоях. |
| app.ts | регистрация createPostToVkFunction (8 функций). |
| тесты | vk (7), post-to-vk (7), draft-article VK (3), env empty-string (2). |

**Себестоимость:** VK добавляет ~один Sonnet-вызов (~$0.05-0.10/статья) ТОЛЬКО когда VK включён. Учтён в $-ledger (totalCost, pipeline_runs, perAgentCostUsd.socialVk).

---

## 2. ⚠️ Мульти-агентный review поймал CRITICAL (и почему это важно)

Перед деплоем — Workflow adversarial review (4 dimension-ревьюера: correctness/integration, vk-api, cost-budget, config-secrets-tests → верификация каждой находки; 16 агентов, 12 raw → 11 confirmed). Исправлены:

1. ⚠️ **CRITICAL — пустая строка VK_OWNER_ID крашила ВЕСЬ pipeline-воркер.** `VK_OWNER_ID: z.string().regex(...).optional()` — `.optional()` пропускает ТОЛЬКО `undefined`, не `""`. compose инъектит `${VK_OWNER_ID:-}` = `""` когда оператор не задал VK (дефолтный «выключено»). → "" падало на regex → `loadEnv` throw → а `loadPipelineEnv` зовётся в начале КАЖДОЙ Inngest-функции → крах всего воркера в самом частом состоянии (VK не настроен). **Фикс:** `z.union([z.string().regex(...), z.literal("")]).optional()` (как существующий `urlOrEmpty`). Регресс-тест в env.test.ts. **Верифицировано live:** pipeline healthy с VK_OWNER_ID="" в контейнере.
2. **HIGH — wall.post без `guid` → дубль на стене при ретрае Inngest.** VK дедуплицирует по guid в окне ~1ч. Фикс: `guid = articleId` без дефисов.
3. **MEDIUM — captcha(14)/flood(9)/access-denied(15/200/214) слепо ретраились** → эскалация throttling community-токена. Фикс: `VkApiError.code` + `NON_RETRYABLE_VK_CODES` → post-to-vk на них НЕ ретраит (возвращает failed).
4. **LOW** — HTTP-status check перед `res.json()` (edge/Qrator не-200 HTML). **LOW** — тест happy-path проверяет что токен/owner/guid реально доходят до body.

**Принято как pre-existing (не VK-specific, не трогал):** soft-cap overshoot чуть шире на VK-вызов (budget-gate — pre-check, без per-step cutoff; audit L2); $-VK не записан если функция падает между social-vk и record-run (как halt/persist-fail из M4; audit L1). Консистентно с TG-веткой.

**Урок:** review мультиагентом перед деплоем фичи, трогающей живой контур + внешний API, окупился — CRITICAL ушёл бы в прод и положил весь автопостинг.

---

## 3. ⚠️ ИСПРАВЛЕНИЕ правила re-sync Inngest (важно, session-21 ошибался)

**НОВЫЙ id функции boot НЕ регистрирует автоматически.** После deploy сервер показывал **7** функций, не 8 — post-to-vk отсутствовал. Нужен ЯВНЫЙ re-sync:
```
docker compose -f docker-compose.prod.yml exec -T api node --input-type=module -e \
  'const r = await fetch("http://pipeline:8787/inngest",{method:"PUT"}); console.log(r.status, await r.text())'
```
⚠️ **Только `pipeline:8787` из api/inngest-контейнера. НЕ `localhost:8787` из pipeline** (ломает app-url → EOF → падают ВСЕ функции, session 21).

**Правило (корректное):**
- Новый / переименованный id функции → **re-sync обязателен** (PUT pipeline:8787).
- Изменение только КОДА того же id → re-sync НЕ нужен (boot отдаёт обновлённый манифест, сервер id уже знает).

(session-21 handoff утверждал «новый id re-sync не нужен» — это было НЕ проверено и неверно.) После re-sync: 8 функций, post-to-vk есть, app-url pipeline:8787, loop healthy.

---

## 4. Деплой + верификация (session 22)

- push → `./deploy.sh` (git pull + build pipeline + migrate=no-op + up -d). **Миграции НЕ было** (VK на существующей channels + channel_kind enum, где 'vk' уже есть с session ~6).
- Проверено live: VM HEAD `d2ad629`, 7 контейнеров healthy; контейнер pipeline имеет `VK_OWNER_ID=[]` (пусто) и **healthy** → CRITICAL-фикс работает в проде; re-sync → 8 функций (post-to-vk есть), app-url `http://pipeline:8787/inngest`; loop healthy (function.finished, без failed/EOF/localhost).

---

## 5. Осталось (пост-M0)

- **Включить VK live:** добыть VK community token (scope wall,groups,offline) + owner_id стены → .env → up -d pipeline. Затем проверить первый реальный wall.post.
- **Дзен** posting (нет нормального public API — отложено), **AudioAgent** (ElevenLabs + WS-прокси Render).
- **Dedicated `@x10_daily_test_bot`** + auth Mini App. **Домен** x10.media. **Sentry** (DSN пуст) / **S3-аватары**.
- **Хвост аудита LOW** (L1/L2/L3, L7-L18; whjv1en1d.output) + LOW из VK-review (soft-cap doc, ledger-on-fail).

---

## 6. Стартовый промпт для следующей сессии

> Прочитай (в порядке): `docs/handoffs/handoff-session-22.md` + `handoff-session-21.md` + memory `project_x10_deploy_state.md` + CLAUDE.md. Если трогаем Timeweb-инфру — skill `timeweb-telegram-deploy`.
>
> Состояние: M0 + walking-skeleton ЖИВ и АВТОНОМЕН на Timeweb. Cron `ingest-rss` (*/5, gating) → 5 RSS → IngestAgent gate → draft (B2 через AI Gateway) → post-to-tg → «Деловой вестник» (-1003773645085). **HEAD `d2ad629`.** ⚠️ api.telegram.org только по IPv6 (NAT66). **8 Inngest-функций.**
>
> Session 22 итог: **VK posting** — автопостинг на стену сообщества. lib/vk.ts (wall.post, guid-идемпотентность, VkApiError+non-retryable коды), post-to-vk (Inngest, уважает /posting, без конфига скипает), draft-article генерит VK-вариант при конфиге (иначе ветка ВЫКЛ — Sonnet не тратится), env VK_ACCESS_TOKEN+VK_OWNER_ID во всех слоях. **VK выключен по умолчанию** (деплой не изменил поведение прода). Мульти-агентный adversarial review поймал CRITICAL (пустая строка VK_OWNER_ID крашила весь воркер — .optional() не пропускает "") + HIGH/MEDIUM/LOW — все исправлены. 96/96 тестов.
>
> ⚠️ Чтобы ВКЛЮЧИТЬ VK: VK_ACCESS_TOKEN (scope wall,groups,offline) + VK_OWNER_ID (id стены, отрицательный для сообщества) в .env.production → up -d pipeline.
> ⚠️ Re-sync Inngest: новый/переименованный id функции → `PUT http://pipeline:8787/inngest` из api-контейнера ОБЯЗАТЕЛЕН (boot не регистрирует новый id). НЕ localhost из pipeline.
>
> VM: `ssh root@37.77.105.82`, репо `/opt/x10-daily`, передеплой `./deploy.sh`. НЕ создавай/удаляй VM циклично.
>
> Выбери: (a) включить+проверить VK live (нужен токен от Константина); (b) AudioAgent (ElevenLabs + WS-прокси Render); (c) dedicated @x10_daily_test_bot + auth Mini App; (d) домен x10.media; (e) Sentry / S3-аватары; (f) хвост LOW аудита.

---

## 7. Ссылки

| Хочешь | Открой |
|---|---|
| Inventory + доступы + грабли | memory `project_x10_deploy_state.md` |
| VK-клиент | [lib/vk.ts](../../apps/workers/pipeline/src/lib/vk.ts) |
| VK post-функция | [post-to-vk.ts](../../apps/workers/pipeline/src/inngest/functions/post-to-vk.ts) |
| VK-вариант в draft | [draft-article.ts](../../apps/workers/pipeline/src/inngest/functions/draft-article.ts) |
| Предыдущий handoff | [handoff-session-21.md](./handoff-session-21.md) |
