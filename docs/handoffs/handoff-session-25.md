# Handoff · Session 25 — real digest-hero в miniapp (синтез из топ-статей + PPR-фикс запекания)

**Дата:** 11 июня 2026
**Что произошло:** По выбору Константина («остаток miniapp») сделал **real digest-hero** — заменил статичный мок home-hero (с выдуманной цитатой Рыбакова) на реальные данные. Новый синтезирующий API-эндпоинт + перевод home на PPR-дыры. Adversarial-ревью (10 агентов) поймал HIGH-регресс (запекание мок-fallback в статику → ссылки-404), устранён до деплоя. Задеплоено + live-верифицировано, автономный контур цел.
**Репозиторий:** https://github.com/BIZKON/x10-daily
**HEAD кода:** `0ab5868` · `origin/main` synced · задеплоено (`./deploy.sh`, 3 деплоя: digest-hero `7e77f01` + брендовые обложки `e030d51` + языковой гейт `0ab5868`).
**Предыдущий handoff:** [handoff-session-24.md](./handoff-session-24.md). Inventory/доступы/грабли — memory `project_x10_deploy_state.md`.

---

## 0. TL;DR — что ЖИВО ПРЯМО СЕЙЧАС

- **Автономный контур постит сам** (без изменений с s24): DeepSeek v4-flash, RSS→draft→слот-постинг 4/день. IPv6-watchdog active. **Проверено после рестарта пайплайна:** cron `scheduled.timer` тикает, функции finishing, telegram IPv6 302/0.147s, 0 ошибок.
- **Miniapp home-hero «Главное сегодня» — РЕАЛЬНЫЙ.** `app.pro-agent-ai.ru` отдаёт реальные топ-статьи дня (slug→читалка), верная МСК-дата, **без выдуманной цитаты Рыбакова**. Лента 40+. Читалка достроена (s24).
- 🚀 **Mini App ЗАПУЩЕН** — Web App menu button «Х10 Daily» выставлен на `@Sekretar_Syrov_IP_bot` через Bot API (`setChatMenuButton`, НЕ BotFather). Живо: открыть бота → кнопка → лента. Auth-цепочка проверена вживую перед запуском (см. §3c).

---

## 1. Real digest-hero — что сделано

home-hero раньше = статичный мок `DAILY_DIGEST` с **выдуманной цитатой Рыбакова** («Кредитное окно закрыто…») и устаревшей датой «26 мая» → нарушение ToV (анти-инфобиз, «без выдуманных цитат», кейс Романчук) на ПЕРВОМ экране. Заменён реальными данными.

- **API `GET /v1/digests/hero` (НОВЫЙ, [routes/digests.ts]):**
  - editorial-first: последний `digests` где `sentAt` не null → если есть, отдаёт его (`synthetic:false`).
  - иначе **СИНТЕЗ** из реальных топ-статей дня: `articles` status ready/published, окно 14д, сортировка `isFeatured→Σreactions→свежесть`, limit 5. `synthetic:true`, без rybakovTake/premiumTeaser (не выдумываем). **НЕ персистится** — считается на лету (таблица `digests` остаётся чисто редакционной).
  - 404 только если в БД вообще нет контента.
  - ⚠️ **`/latest` и `/:date` НЕ тронуты** — их потребляет АДМИНКА (`fetchAdminLatestDigest` ждёт «выпуск или 404»). Поэтому отдельный `/hero`, а не правка `/latest`.
  - +7 юнит-тестов (`buildSyntheticDigest`, `todayMskIsoDate` вкл. переход через полночь МСК). SQL-курация — живьём (как feed.ts).
- **miniapp:** `fetchDigest` ([lib/api.ts]) → `loadDigest` ([lib/feed.ts]) → `HeroDigest` ([hero-digest.tsx]). Bullets кликабельны → читалка. Дата форматируется в ru-RU/МСК. Бейдж — статичный «Дайджест» (без ложного счётчика). Удалён мок `DAILY_DIGEST`.
- **Авто-апгрейд:** когда редактор создаст выпуск в admin (CRUD уже есть: `/digests/new` + mark-sent) — hero автоматически переключится на editorial, клиент не меняется.

## 2. ⚠️ ГЛАВНАЯ ГРАБЛЯ — Next 16 Cache Components/PPR запекал мок в статику

**Симптом (нашёл adversarial-ревью):** home `/` был **полностью статичен** → `next build` исполнял `"use cache"`-компоненты на билде и **запекал build-time fallback в `index.html`**. А на билде API недоступен (NEXT_PHASE guard в `api.ts getBaseUrl`→null) → запекался **МОК** (УСН/Wildberries) со слагами, которых нет в БД. → ~15 мин после КАЖДОГО деплоя/рестарта home отдавал выдуманные заголовки + ссылки в **404** (регресс самой цели правки). Та же проблема была у ЛЕНТЫ (пред-существующая).

**Фикс = PPR-дыры:** `await connection()` (next/server) **ВНУТРИ Suspense-обёрнутого компонента** (`HeroDigest`/`DailyFeed`), **НЕ на уровне страницы** (page-level `connection()` = build-error «Uncached data accessed outside of Suspense»). → компоненты *postponed* на билде (мок НЕ запекается), тянут живой API в рантайме; кэш 15м = `"use cache"` на data-функции. Все fallback'и → нейтральные/link-safe.

**Проверка билда:** `/` стал **◐ Partial Prerender**, `index.html` = 0 мок-слагов + 2 скелетона (hero+лента — дыры). **Паттерн обязателен для любой miniapp-страницы с живыми данными.**

## 3. Ревью + деплой + верификация

- **Adversarial Workflow-ревью ДО деплоя** (10 агентов, 5 измерений × состязательная верификация): 4 находки подтверждены, 1 false-positive опровергнут. **1 HIGH** (мок-запекание → PPR-фикс) + **3 LOW**: дата после полуночи ≤15м [принято — synthetic], ложный счётчик [→статичный лейбл], editorial-row leak [→явная проекция под контракт]. Все закрыты.
- **Деплой:** commit `7e77f01` на main → push → `./deploy.sh` (VM git pull ff → build → up -d). Пересоздал api+miniapp+admin+pipeline. **Pipeline-рестарт штатный** (id функций не менялись → re-sync НЕ нужен).
- **Live-верификация:** `/v1/digests/hero`→200 synthetic с 5 реальными статьями (issueDate 2026-06-11, без rybakovTake); home HTML → «Главное сегодня» + реальные слаги (aeroflot/spacex/whoosh), **0 мок-слагов, 0 выдуманной цитаты**, дата «четверг, 11 июня», static shell на месте; `/latest`→404 (админка цела); контур жив (см. §0).

## 3b. Доп. инкремент («двигаемся дальше») — брендовые обложки + link-safe лента

HEAD `e030d51`. Продолжение «остаток miniapp» — home launch-robustness:
- **Самодостаточные брендовые обложки** ([cards/branded-cover.tsx]): внешние unsplash-плейсхолдеры (US-CDN — медленно/ненадёжно из РФ + 6 повторяющихся стоков) заменены на `BrandedCover` (steel→night CSS-градиент + lucide-иконка рубрики; тинты ТОЛЬКО канон red/gold) для статей без реального coverImageUrl. `FeedItem.imageUrl`→`string|null`, +`categoryKey`; карточки `news`/`deep-dive` ветвятся `<Image>`/`<BrandedCover>`; `CATEGORY_PLACEHOLDER_IMAGES` удалён. Реальные обложки (VisualAgent later) → `<Image>`.
- **link-safe лента**: `loadDailyFeed` при сконфигурированном бэкенде (`isApiConfigured`) и пустом/упавшем ответе → честный empty-state в `DailyFeed`, НЕ мок-FEED со слагами-404. Мок — только dev/demo без бэкенда. (Закрывает хвост находки s25-ревью про hero — теперь и лента link-safe.)
- **Verified:** typecheck/build (`/` = ◐ PPR), preview-скриншоты (covers red/gold + deep-dive контраст белого по обложке ок + real-image path), live (home **0 unsplash**, 40 branded-gradient, real-контент, контур healthy после рестарта, IPv6 302). Adversarial Workflow-ревью (7 агентов): **2 LOW** (мок a4→null испр.; **/video всё ещё запекает unsplash — техдолг вне scope**), 2 опровергнуто.

## 3c. 🚀 Запуск Mini App (через Bot API, по выбору Константина)

Перед запуском — полный аудит готовности + **end-to-end проверка auth вживую**:
- `telegram-web-app.js` в [layout.tsx] (`beforeInteractive`) → `window.Telegram.WebApp` в webview ✅; клиент [telegram-provider.tsx] читает initData → [auth-actions.ts] `loginWithTelegramAction` → `/v1/auth/telegram` → cookie ✅.
- Нет CSP / X-Frame-Options → Telegram-webview встроит ✅. `getMe` → токен = `@Sekretar_Syrov_IP_bot` (id 8189028690).
- **Live-проба auth:** подделал валидный initData токеном бота (на VM, канон-алгоритм Telegram) → POST `/v1/auth/telegram` → **HTTP 200 + JWT + создан reader** (`x10_launch_probe`). Вся цепочка HMAC→upsert→JWT работает на живом контуре.
- **Запуск:** `setChatMenuButton` (Bot API) → `{type:web_app, text:"Х10 Daily", url:app.pro-agent-ai.ru}` → `getChatMenuButton` подтверждает. Живо для всех, кто откроет бота.
- ⚠️ **Снять/изменить** — тем же `setChatMenuButton`. ⚠️ **Dedicated-бот позже** — куплено с постингом: новый бот → админ @delovoy_vestnik + обновить `TELEGRAM_BOT_TOKEN` + redeploy (один токен на auth+постинг). ⚠️ Остался probe-user `x10_launch_probe` в прод-БД (cleanup-DELETE отклонён классификатором).

## 3d. 🇷🇺 Жёсткое правило «только русский» (после запуска нашлись англ. статьи)

HEAD `0ab5868`. После запуска в ленте оказались **7 полностью английских** статей (англоязычные RSS → DraftAgent драфтил по-английски; в промпте НЕ было правила языка) со слагами → 404.
- **Промпт** [draft.ts]: явное правило в системном промпте DraftAgent — только русский, иностранные источники переводить (латиницей лишь бренды/термины).
- **Языковой гейт** [persist.ts `russianRatio`/`MIN_RUSSIAN_RATIO=0.2` + draft-article.ts]: доля кириллицы по всему драфту < 0.2 → halt СРАЗУ после draft (record cost + `return {skipped}`, НЕ throw → без ретраев) + `console.warn` (видимость). Порог 0.2 консервативный (отказ модели бинарен: ≈0.7 рус / ≈0 англ). Валидировано на 338 живых статьях: 7 плохих = 0.00, легит русские tech (Windows Server/OpenAI/Xiaomi) НЕ зафлагованы.
- **7 существующих заархивированы** ([scripts/archive-non-russian.mts], status→archived → лента фильтрует). ⚠️ запуск backfill/one-off на прод-БД: `docker compose run --rm --no-deps -v "$PWD/scripts/X.mts:/app/apps/workers/pipeline/_X.mts" -e DATABASE_URL ... pipeline -c 'cd /app/apps/workers/pipeline && pnpm exec tsx _X.mts'` (НЕ `node --strip-types` — @x10/db extensionless; НЕ голый tsx — local-bin; scripts/ не в образе → монтировать ВНУТРЬ пакета). ⚠️ прод-DB-запись через ssh авто-классификатор блокирует без явной авторизации юзера.
- Косметика: `line-clamp-3` на заголовках карточек (deep-dive абс. оверлей налезал на бейджи).
- Ревью (10 агентов): 3 LOW внесены (порог→0.2, +console.warn, fix backfill-команды), 3 опровергнуто. Verified live: 0 англ. в ленте, контур healthy после рестарта.

## 4. ⚠️ Грабли (повторяемые)

- **PPR/Cache Components:** живые данные на статической странице → `connection()` ВНУТРИ Suspense-компонента + `"use cache"` на data-fn; fallback'и link-safe. Иначе build запекает мок (см. §2).
- **Деплой/рестарт ТОЛЬКО** `docker compose --env-file .env.production …` или `./deploy.sh` (иначе `${VAR}` пустые → crash-loop). ⚠️ `docker compose logs` без `--env-file` сыплет warning'ами «variable not set» — это артефакт CLI, НЕ рантайма.
- **api.telegram.org из РФ — только IPv6 + DHCPv6; watchdog `x10-ipv6-ensure.timer` лечит /2мин; `netplan apply` НЕЛЬЗЯ.**
- **`/v1/digests/latest`** потребляет админка — не менять контракт; для miniapp — `/hero`.
- **Newsletter:** `assemble-newsletter` существует, но без cron и НЕ пишет в `digests` (email-контент для Resend). В `digests` нет автономного писателя.

## 5. Следующая сессия (по выбору Константина)

- **Mini App ЗАПУЩЕН (s25, §3c).** Дальше: **PostHog** (EU, 152-ФЗ) — измерить запуск (DAU / retention / воронки); smoke-test в Telegram (Константин: открыть @Sekretar_Syrov_IP_bot → кнопка «Х10 Daily» → лента/читалка/реакции живьём); dedicated `@x10_daily_bot` (с учётом коуплинга с постингом — §3c).
- **P1 — Платежи (revenue loop):** Telegram Stars + ЮKassa → `subscriptions` → замкнуть paywall (read-side готов) + premium-флаг. Скилл `yookassa-timeweb-payments`. Нужны: ЮKassa shopId/secret + тарифы.
- **Остаток miniapp:** реальные обложки статей (VisualAgent post-M0, Gemini-прокси — сейчас все авто-статьи рисуют `BrandedCover`); auth UX (401-recovery — ⚠️ НЕ верифицируемо без запуска в TG, риск сломать рабочий auth); ⚠️ **`/video` грузит внешние unsplash из РФ (мок `VIDEOS`, статик-роут — техдолг; весь /video мок, нужны real-данные)**. _(link-safe лента — СДЕЛАНО в `e030d51`.)_
- **Отложенное (s24):** failed-раны в $-ledger (ветка `fix/pipeline-failed-runs-ledger` на origin — решить, мержить ли); снизить $-потолок $15→$5.

---

## Стартовый промпт для новой сессии

> Прочитай (в порядке): `docs/handoffs/handoff-session-25.md` + memory `project_x10_deploy_state.md` + CLAUDE.md. Timeweb-инфра — skill `timeweb-telegram-deploy`.
>
> Состояние: M0 + walking-skeleton ЖИВ+АВТОНОМЕН на Timeweb. **HEAD кода `0ab5868`.** Автономный постинг 4/день (DeepSeek v4-flash, IPv6-watchdog; ⚠️ языковой гейт — только русский). **Miniapp ЖИВ+наполнен** (app.pro-agent-ai.ru): лента 40+, читалка, **real digest-hero** (синтез из топ-статей, без выдуманных цитат), **самодостаточные брендовые обложки** вместо внешних unsplash. **Mini App ЗАПУЩЕН** — Web App menu button «Х10 Daily» через Bot API (`setChatMenuButton`) на @Sekretar_Syrov_IP_bot, auth проверен вживую.
>
> Session 25: (a) real digest-hero — новый `GET /v1/digests/hero` (editorial-first→синтез из топ-статей, `/latest` не тронут), home → **PPR-дыры** (`connection()` внутри Suspense — иначе build запекал мок-fallback со слагами-404). (b) брендовые обложки (`BrandedCover`, канон) вместо unsplash + link-safe лента. (c) Mini App ЗАПУЩЕН (menu button через Bot API). (d) **жёсткое правило «только русский»** — языковой гейт (`russianRatio<0.2`→halt) + промпт DraftAgent; 7 англ. статей заархивированы. 3 adversarial-ревью + live-верифицировано.
>
> **ЗАДАЧА (выбор Константина):** Mini App уже ЗАПУЩЕН (s25 §3c, menu button на @Sekretar_Syrov_IP_bot). Дальше — **PostHog** (EU, 152-ФЗ — измерить запуск) ЛИБО **P1-платежи** (Stars+ЮKassa→subscriptions→paywall, нужны shopId/secret+тарифы) ЛИБО **dedicated @x10_daily_bot** (коуплинг с постингом — §3c) ЛИБО остаток miniapp (реальные обложки/auth-UX/`/video`). ⚠️ Грабли: деплой только `./deploy.sh`; api.telegram.org только IPv6 (watchdog, `netplan apply` НЕЛЬЗЯ); PPR — `connection()` внутри Suspense + `"use cache"` на data-fn; `/digests/latest` потребляет админка; **запуск Mini App был через Bot API `setChatMenuButton`, auth+постинг на одном токене**. VM: ssh root@37.77.105.82, репо /opt/x10-daily. Режим: многоагентность ВКЛ (Workflow-ревью перед деплоем в живой контур), полная автономия. НЕ пересоздавай VM.

---

## 6. Ссылки

| Хочешь | Открой |
|---|---|
| Inventory + доступы + грабли + история | memory `project_x10_deploy_state.md` |
| Синтез-hero эндпоинт | [routes/digests.ts](../../apps/api/src/routes/digests.ts) (`/hero`, `buildSyntheticDigest`, `selectHeroArticles`) |
| miniapp hero | [hero-digest.tsx](../../apps/miniapp/src/components/hero-digest.tsx) + [feed.ts](../../apps/miniapp/src/lib/feed.ts) (`loadDigest`) |
| PPR-дыры (паттерн) | [(shell)/page.tsx](../../apps/miniapp/src/app/(shell)/page.tsx) (`connection()` в HeroDigest/DailyFeed) |
| Тесты hero | [digests.test.ts](../../apps/api/test/digests.test.ts) |
| Предыдущий handoff | [handoff-session-24.md](./handoff-session-24.md) |
