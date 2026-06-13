# Handoff · Session 25 — real digest-hero в miniapp (синтез из топ-статей + PPR-фикс запекания)

**Дата:** 11 июня 2026
**Что произошло:** По выбору Константина («остаток miniapp») сделал **real digest-hero** — заменил статичный мок home-hero (с выдуманной цитатой Рыбакова) на реальные данные. Новый синтезирующий API-эндпоинт + перевод home на PPR-дыры. Adversarial-ревью (10 агентов) поймал HIGH-регресс (запекание мок-fallback в статику → ссылки-404), устранён до деплоя. Задеплоено + live-верифицировано, автономный контур цел.
**Репозиторий:** https://github.com/BIZKON/x10-daily
**HEAD кода:** `75458ff` · `origin/main` synced · задеплоено (`./deploy.sh`, 7 деплоев: digest-hero `7e77f01` · обложки `e030d51` · языковой гейт `0ab5868` · Налоги `c5f4fd4` · Профиль-identity `1319e87` · Видео `2a63b99` · Tier-2 prefs `75458ff`).
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

## 5. Следующая сессия — ПЛАН по комментариям Константина (приоритет) + опции

Константин использовал запущенный Mini App и дал 3 правки (это приоритет следующей сессии):

**П1. Дата+время публикации (МСК) под каждым постом/статьёй.** _(малый объём — данные есть)_
- Данные ЕСТЬ: `articles.publishedAt`; feed API уже отдаёт `publishedAt` (effectiveAt), digest/article — тоже.
- Сделать: добавить `publishedAt` в UI-тип `FeedItem` ([lib/feed.ts] `mapApiItem` его НЕ маппит сейчас) → формат МСК («13 июня, 14:30», `Intl` ru-RU + `timeZone: Europe/Moscow`) → рендер под карточками ([components/cards/news-card.tsx, deep-dive-card.tsx, daily-take-card.tsx], рядом с «N мин чтения») + в читалке ([article/[slug]/page.tsx]) + опц. в hero-bullets.
- ⚠️ относительное время («2 дня назад») на `"use cache"`/PPR — устаревает; используй АБСОЛЮТНУЮ дату (стабильна).

**П2. Реакции-смайлики: рабочая выпадающая панель + ЖИВЫЕ счётчики.** _(средне-большой; самое важное по engagement)_
- Проблема (Константин): «смайлики под постами не живые, счётчики не работают; нужна выпадающая панель со смайликами, чтобы реально ставить».
- Текущее: на КАРТОЧКАХ ленты — статичный `Heart` + число (НЕ кнопка, карточка = Link); реакции ставятся ТОЛЬКО в читалке ([components/article/engagement-bar.tsx], 3 типа fire/insight/question, server actions + optimistic — РАБОТАЮТ при auth). Авто-статьи имеют 0 реакций → выглядит «мёртво».
- Бэкенд ЧАСТИЧНО есть: `articles.reactions` jsonb `{fire,insight,question}` + `POST /v1/articles/:id/reactions` ([routes/engagement.ts]) + `toggleReactionAction` ([lib/engagement-actions.ts]) + `fetchArticleUserState` (/me).
- Сделать: **emoji-picker popover** на карточках ленты (и/или в читалке) — тап по реакции → выпадает панель эмодзи → выбор → optimistic + persist + живой счётчик. ⚠️ карточка = Link → реакция-контрол должен быть отдельным client-компонентом, тап по нему НЕ должен открывать статью (stopPropagation). ⚠️ требует auth (в TG юзер авторизован).
- РЕШЕНИЕ: 3 фикс-типа как эмодзи (🔥/💡/❓ — быстро, без схемы) ИЛИ расширить набор эмодзи (нужна правка схемы `reactions` + миграция, как 0011). Рекомендую начать с 3-как-эмодзи (бэкенд готов), popover + interactive на карточках.

**П3. Картинки к постам — РЕШЕНИЕ Константина + реализация.** _(decision-gated)_
- Сейчас: авто-статьи без `coverImageUrl` → `BrandedCover` (CSS, на бренде, RU-перф). Реальных изображений нет.
- Варианты (нужен выбор):
  - (A) **og:image из источника** — ingest/draft извлекает лид-картинку RSS/og:image → `coverImageUrl`. Реально, бесплатно. ⚠️ copyright (чужие фото) + не у всех источников + прокси для RU-доступа.
  - (B) **VisualAgent (генерация)** — Gemini 2.5 Flash через прокси (CLAUDE.md §4 #11, post-M0, feature-flag): обложка/инфографика по статье. На бренде, без copyright. ⚠️ нужен Gemini-прокси (РФ-блок) + стоимость + хранилище (S3/[uploads]).
  - (C) **Оставить BrandedCover** — честно/быстро/без зависимостей (текущее).
  - Рекомендация: для запуска (C) ОК; «вирусным» → (B) когда будет прокси; (A) рискован copyright.

**Стратегические опции (по выбору):**
- **P1 — Платежи (revenue):** Telegram Stars + ЮKassa → таблица `subscriptions` (УЖЕ ЕСТЬ: tier/status/provider) → замкнуть paywall (read-side `stripPaidContent` готов) + premium-флаг. Скилл `yookassa-timeweb-payments`. Нужны: ЮKassa shopId/secret + тарифы.
- **PostHog** (EU, 152-ФЗ) — измерить запуск (DAU/retention/воронки) теперь когда есть юзеры.
- **dedicated `@x10_daily_bot`** — ⚠️ коуплинг с постингом (один токен на auth+постинг; новый бот → админ @delovoy_vestnik + сменить токен + redeploy).
- **Фичи-потребители prefs** (НЕ моки): персональный дайджест/push (читают `user_preferences`); данные клампов + membership-онбординг; AudioAgent-подкасты (/video подкасты).
- **Отложенное (s24):** failed-раны в $-ledger (ветка `fix/pipeline-failed-runs-ledger` на origin — решить, мержить ли); снизить $-потолок $15→$5.
- **Чистка:** probe-user `x10_launch_probe` + его prefs-строка в прод-БД (от e2e-проб; безвредны, удалить при желании — нужна авторизация прод-записи).

---

## Стартовый промпт для новой сессии

> Прочитай (в порядке): `docs/handoffs/handoff-session-25.md` + memory `project_x10_deploy_state.md` + CLAUDE.md. Timeweb-инфра — skill `timeweb-telegram-deploy`.
>
> Состояние: M0 + walking-skeleton ЖИВ+АВТОНОМЕН на Timeweb. **HEAD кода `75458ff`.** Автономный постинг 4/день (DeepSeek v4-flash, IPv6-watchdog; ⚠️ языковой гейт — только русский). **Mini App ЗАПУЩЕН** (Web App menu button через Bot API на @Sekretar_Syrov_IP_bot, auth вживую). **ВСЕ моки→живые** (s25): лента/hero/читалка/обложки, Налоги (лента рубрики), Профиль (identity+stats+подписки+расписание — `user_preferences`/миграция 0011), Видео (YouTube RSS), Сообщество (статы/события + «Мой кламп»→честный join, klamps пуста). В коде нет выдуманного контента.
>
> Session 25: (a) real digest-hero — новый `GET /v1/digests/hero` (editorial-first→синтез из топ-статей, `/latest` не тронут), home → **PPR-дыры** (`connection()` внутри Suspense — иначе build запекал мок-fallback со слагами-404). (b) брендовые обложки (`BrandedCover`, канон) вместо unsplash + link-safe лента. (c) Mini App ЗАПУЩЕН (menu button через Bot API). (d) **жёсткое правило «только русский»** — языковой гейт (`russianRatio<0.2`→halt) + промпт DraftAgent; 7 англ. статей заархивированы. 3 adversarial-ревью + live-верифицировано.
>
> **ЗАДАЧА — ПРИОРИТЕТ: 3 правки Константина (он использовал запущенный Mini App), детали в §5:** **(П1)** дата+время публикации (МСК) под каждым постом/статьёй — данные есть (`publishedAt`), малый объём; **(П2)** реакции-смайлики — рабочая выпадающая emoji-панель + ЖИВЫЕ счётчики (сейчас на карточках статичны; ставятся только в читалке; бэкенд 3 типов есть — `reactions` jsonb + POST /v1/articles/:id/reactions); **(П3)** картинки к постам — РЕШЕНИЕ Константина (og:image из источника / VisualAgent-генерация / оставить BrandedCover) + реализация. ЗАТЕМ опции: P1-платежи (Stars+ЮKassa→`subscriptions` есть→paywall) / PostHog / dedicated-бот / фичи-потребители prefs. ⚠️ Грабли: деплой только `./deploy.sh`; api.telegram.org только IPv6 (watchdog, `netplan apply` НЕЛЬЗЯ); PPR — `connection()` ВНУТРИ Suspense-компонента + `"use cache"` на data-fn (не на странице); `/digests/latest` потребляет админка; **миграции hand-written + журнал вручную, `db:generate` НЕЛЬЗЯ; deploy.sh гонит `db:migrate` перед up -d (плохая миграция → set -e аборт, старая версия живёт)**; auth+постинг на одном токене @Sekretar_Syrov_IP_bot. VM: ssh root@37.77.105.82, репо /opt/x10-daily. Режим: многоагентность ВКЛ (Workflow-ревью перед деплоем в живой контур), полная автономия. НЕ пересоздавай VM.

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
