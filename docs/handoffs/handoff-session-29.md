# Handoff · Session 29 — og-превью, deep-link Mini App в канале, правки читалки, старт ИИ-обложек

**Дата:** 2026-07-25
**Локальный HEAD:** `ec685b1` · **origin/main:** `987d0c5` (⚠️ **ahead 2, НЕ запушено**)
**Прод:** `987d0c5` — `app.pro-agent-ai.ru` жив, автономный контур постит.
**Предыдущий handoff:** `docs/handoffs/handoff-session-28.md`.

---

## 0. TL;DR — что изменилось за сессию

- **Брендовые превью ссылок + иконки** — на проде. Ссылки из канала разворачиваются в карточку с og-картинкой (было: без картинки, generic-заголовок).
- **Deep-link Mini App из канала** — на проде и **АКТИВИРОВАН**. Тап по тексту поста открывает статью внутри Telegram.
- **Две правки владельца по скриншотам** — на проде: длинные значения не вылезают за границы блока; в посте канала один вход (ссылка), кнопка убрана, превью сохранено.
- **ИИ-обложки (Спека 2): блокеры СНЯТЫ спайком**, Task 1 из 7 сделан. Не задеплоено, инертно.
- **Перф-диагностика deep-link** проведена (17 подтв. находок) — фикс НЕ реализован, ждёт решения.

## 1. Что сделано (по порядку)

### a) Брендовые og-превью + иконки — `7e9eac7` (на проде)
Было: favicon 404, og-image 404, og-тегов НЕТ, у статьи нет `generateMetadata`. Сделано: `opengraph-image.jpg` 1200×630 (steel→night, Manrope-кириллица; **отрисовка headless Chrome → шрифт запечён в JPEG, 0 новых зависимостей**), `icon.png`/`apple-icon.png`, `generateMetadata` статьи, `lib/site-meta.ts` (единый источник бренд-констант).

**Адверс-ревью (36 агентов, 13 подтв.) поймало:**
- 🔴 **свой `openGraph` в `generateMetadata` ЗАМЕЩАЕТ родительский ЦЕЛИКОМ** (не мержит по полям) → у статьи пропадали `og:image`/`site_name`/`locale`/размеры, `twitter:card` падал до `summary`. Бренд-поля дублировать ЯВНО.
- 🔴 **`loadArticle` не имел гейта `isApiConfigured()`** (в отличие от соседних `loadDailyFeed`/`loadCategoryFeed`) → мок-слаги отдавались В ПРОДЕ как настоящие статьи с выдуманными цифрами (API 404, miniapp 200). Нарушение канона §6. Исправлено.
- `metadataBase` параметризован `X10_BASE_DOMAIN` (build-arg + рантайм-env), `?v=1` cache-busting og-картинки.

### b) Спека 1 — deep-link Mini App в канале — `f17d712` (на проде, АКТИВЕН)
Брейншторм → 2 спеки → план → TDD-реализация. Хелпер `buildMiniAppDeepLink`, env `TELEGRAM_BOT_USERNAME`, `StartParamRouter` в miniapp.

**Механика (веб-проверено):** в КАНАЛАХ нельзя `web_app`-кнопки (только в личке) → url-кнопка на `t.me/<bot>?startapp=<slug>`; Main Mini App настраивается в @BotFather (владелец сделал).

**Адверс-ревью (7 подтв.) поймало 🔴 HIGH зацикливание:** читалка `/article/[slug]` живёт ВНЕ группы `(shell)`, а роутер смонтирован в shell-layout → при переходе на статью размонтируется, а `start_param` жив всю сессию → возврат в ленту выбрасывал обратно на статью. **Фикс: session-guard по СЛАГУ в `sessionStorage`.** Плюс: Telegram кладёт `tgWebAppStartParam` в **hash**, а не query (forward-only тест это пропустил).

**Активация выполнена:** getMe сверил username с токеном, `TELEGRAM_BOT_USERNAME=Sekretar_Syrov_IP_bot` в `.env.production`, pipeline пересоздан. Владелец подтвердил: **работает**.

### c) Правки владельца по скриншотам — `d521043` + `987d0c5` (на проде)
1. **Overflow в читалке:** в numbers-блоке значение имело `shrink-0` → длинный текст вылезал за границу. ⚠️ **Мой первый фикс (`flex-wrap`) был РЕГРЕССИЕЙ** — перенос во flex считается по `max-content`, поэтому длинная ПОДПИСЬ выталкивала значение вниз (даже «36%»), а `justify-between` прижимал его влево; сломало ритм на 36 строках. Ревью поймало (мои 2 скриншота не показали). **Правильно: строка одна, перенос ВНУТРИ колонки значения** — `min-w-0` + `max-w-[60%]` + `text-right` + `[overflow-wrap:anywhere]`. Verified массово: **39 статей / 105 строк → 0 вылетов, 105/105 ритм сохранён**.
2. **Канал — вход один:** inline-кнопка убрана (две точки входа путали), текст-ссылка «Подробнее читай в блоге ProAgent AI →» ведёт на deep-link. **Превью с og-картинкой сохранено через `link_preview_options.url` = web-URL** (Bot API: «URL to use for the link preview; if empty — первый URL из текста»).
   ⚠️ Остаточно: тап по САМОЙ карточке превью уводит в браузер (карточка кликабельна; сделать «немой» нельзя, а `t.me`-превью убило бы og-картинку) — владелец принял.
   ⚠️ Текст ссылки владелец выбрал **вопреки находке ревью** (voice.md: «читай» = ты-императив второго регистра, «блог» в негативной референс-группе about-me.md) — решение зафиксировано, не менять без него.

### d) Спека 2 (ИИ-обложки) — спайк + Task 1 — `e1e28bb`, `ec685b1` (НЕ запушено, НЕ задеплоено)

**🎉 Спайк переписал архитектуру.** Модель **`gemini/gemini-3.1-flash-image-preview`** (= Nano Banana 2) доступна **прямо в Timeweb AI Gateway**:
- вызов: обычный `POST {AI_GATEWAY_BASE_URL}/chat/completions` с этим `model`;
- ответ: **`choices[0].message.images[0].image_url.url`** = `data:image/jpeg;base64,…` (⚠️ `message.content` = `null`!);
- живой прогон: `finish_reason: stop`, JPEG **1408×768, 802 КБ**, `image_tokens: 1120`;
- качество: flat-иллюстрация в палитре бренда, без текста — канон §5 с первого промпта.

**Отменяет:** Google-ключ не нужен, прокси AMS/NL не нужен, 152-ФЗ чище (генерация не покидает РФ). **Хранилище (решение владельца):** диск прод-VM + раздача Caddy, абстракция под будущий S3.

**Task 1 сделан:** миграция `0014_article_visual.sql` (`visual_status` varchar+CHECK 5 состояний, `visual_prompt`, индекс) + журнал + схема Drizzle + env `COVERS_DIR`/`COVERS_PUBLIC_BASE_URL`/`IMAGE_MODEL` сквозь 4 слоя + том `covers`. **Dry-run на КОПИИ прод-схемы:** применение в транзакции exit=0, идемпотентно, CHECK отвергает мусор.

## 2. ▶ ЧТО ДЕЛАТЬ ДАЛЬШЕ (приоритет)

### Приоритет 1 — доделать Спеку 2 (Task 2–7)
План с кодом и тестами: **`docs/superpowers/plans/2026-07-25-ai-cover-images.md`**.
Спека (обновлена спайком): `docs/superpowers/specs/2026-07-24-ai-cover-images-design.md`.

- **Task 2** — VisualAgent (`packages/agents/src/agents/visual.ts`): промпт иллюстрации + `BRAND_STYLE_SUFFIX` (палитра, «no text»).
- **Task 3** — `lib/gemini-image.ts` (вызов + разбор `message.images`, ⚠️ `content=null`) и `lib/cover-storage.ts` (запись на диск, `node:fs/promises`, без новых зависимостей).
- **Task 4** — Inngest `generate-cover` + событие `article/cover.requested`. ⚠️ **новый id функции → re-sync PUT на pipeline:8787 из контейнера api** (грабля §8).
- **Task 5** — ревью в админке (API `admin-visual.ts` + экран очереди): одобрить / перегенерить / без картинки. **HumanGate на картинку обязателен.**
- **Task 6** — фото-пост (`sendPhoto` + caption ≤1024) и реальная обложка в ленте.
- **Task 7** — Caddy `/covers/*` (⚠️ `caddy validate` ДО reload — радиус поражения TLS всего сайта) + `COVERS_PUBLIC_BASE_URL` на проде + адверс-ревью + деплой.

### Приоритет 2 — перф deep-link (диагностика готова, фикс не реализован)
Workflow `wn089j07b` (5 линз, 17 подтв.) измерил: Telegram открывает БАЗОВЫЙ url (корень = лента) → грузится весь фид (HTML 158 КБ, шрифты 147 КБ, JS ~222 КБ gzip), гидрация, server-action логина, и ТОЛЬКО ПОТОМ RSC-хоп на статью. **Статья видна ≈2600 мс** (тёплый кэш). Прод-замеры: `/` полная **4.3–7.3 с**; `/article/<slug>` 1.6–1.8 с; API 1.0–1.24 с (бюджеты проекта: LCP ≤2.5 с, TTFB ≤200 мс — не выполняются).

**Фикс (одобрен ревью, НЕ применён):** сырой инлайн-`<script>` ПЕРВЫМ ребёнком `<body>` в `layout.tsx` (**НЕ** `next/script` — тот исполняется рантаймом Next после бандлов): читает `location.hash` → `location.replace("/article/"+slug+h)` до загрузки бандлов.
🔴 **hash переносить ЦЕЛИКОМ (`+h`)** — там `tgWebAppData` = initData для auth (иначе молча сломается вход, грабля s26); гард `pathname==="/"` + sessionStorage-ключ (общий с `StartParamRouter`) от петли.
Ожидаемый выигрыш: тёплый кэш 2.6 с → 1.7–2.1 с; холодный/4G 1.2–2.2 с.

### Приоритет 3 — мелочи
- Защитный фильтр по `articles.status` в `drain-post-slots` (латентный: выборка в канал не проверяет статус; сегодня недостижимо — пути архивации в админке нет).
- Кэш-заголовки Caddy для `/icon.png`, `/apple-icon.png`, `/opengraph-image.jpg`.
- Устаревший докблок `telegram-html.ts:15` (старый текст ссылки).

## 3. Грабли сессии (переиспользуемо)

- **Next Metadata API:** свой `openGraph` в `generateMetadata` **замещает родительский целиком** — бренд-поля дублировать явно.
- **Вёрстку проверять МАССОВО, а не на 2 скриншотах.** Приём: в браузере фетчить HTML многих статей, вставлять блоки в реальный контейнер и мерить `getBoundingClientRect` по всем строкам (так найдена регрессия ритма).
- **`flex-wrap` считает перенос по `max-content`** — длинный сосед выталкивает элемент на новую строку даже при коротком содержимом; `justify-between` при одном элементе прижимает его к началу.
- **Telegram кладёт `tgWebApp*` в hash-фрагмент**, не в query. Сервер его не видит НИКОГДА.
- **`link_preview_options.url`** позволяет развести ссылку в тексте и URL превью.
- **grep в alpine = busybox:** не поддерживает `--include`/`--exclude-dir` → возвращает пусто и выглядит как «кода нет в контейнере» (ложная тревога). Проверять файл напрямую по пути.
- **curl НЕТ в node-alpine контейнерах** — доступность внешних хостов проверять `node -e` (https.get).
- Пакет pipeline называется **`@x10/worker-pipeline`** (не `@x10/pipeline`).
- **biome:** `noNonNullAssertion`/`useTemplate`/`noArrayIndexKey` — пред-существующие не-гейтящие; сверять счётчик на оригинале файла, не «чинить», разъезжаясь с кодбазой.
- Классификатор безопасности временами «temporarily unavailable» на Bash-мутациях — переждать и повторить.

## 4. Состояние прода (проверено вживую)

`git HEAD` прода `987d0c5`; api health 200; контейнеры healthy; telegram по IPv6 302/0.17 с; Inngest исполняет крон-функции; IPv6-watchdog active; `TELEGRAM_BOT_USERNAME` задан (deep-link активен); лента наполняется (ниша «ИИ-разработка/агенты для бизнеса»).

⚠️ **Локально ahead 2** (`e1e28bb` docs + `ec685b1` Task 1) — **не запушено, не задеплоено**; оба инертны (пока `COVERS_PUBLIC_BASE_URL` пуст — генерация выключена).

---

## Стартовый промпт для новой сессии

> Прочитай (в порядке): `docs/handoffs/handoff-session-29.md` + memory `project_x10_deploy_state.md` + `CLAUDE.md`. Timeweb-инфра — skill `timeweb-telegram-deploy`.
>
> **Состояние:** ProAgent AI жив на проде (`app.pro-agent-ai.ru`, HEAD прода `987d0c5`). Автономный контур постит 4/день в канал «ИИ работает на вас!». Deep-link из канала в Mini App — **активен и подтверждён владельцем**. ⚠️ Локально **ahead 2** (`ec685b1`), не запушено/не задеплоено, инертно.
>
> **Задача сессии: доделать Спеку 2 — ИИ-обложки статей (Task 2–7).** План с кодом и тестами: `docs/superpowers/plans/2026-07-25-ai-cover-images.md`. Спека: `docs/superpowers/specs/2026-07-24-ai-cover-images-design.md`. Task 0 (спайк) и Task 1 (схема 0014 + env + том `covers`) СДЕЛАНЫ.
>
> **Ключевой факт спайка:** модель `gemini/gemini-3.1-flash-image-preview` (Nano Banana 2) работает через **Timeweb AI Gateway** (`AI_GATEWAY_*`, Google-ключ и прокси НЕ нужны). Вызов — `POST /chat/completions`; картинка в **`choices[0].message.images[0].image_url.url`** (`data:image/jpeg;base64`), ⚠️ `message.content` = `null`. Живой прогон: JPEG 1408×768, 802 КБ. Хранилище — диск прод-VM (том `covers`) + раздача Caddy.
>
> ⚠️ **Грабли:** деплой ТОЛЬКО `./deploy.sh`; миграции hand-written + журнал, ADD VALUE тестировать на прод-дампе; новый env воркера → `readBindingsFromEnv`; новый id Inngest-функции → re-sync PUT на pipeline:8787 **из контейнера api**; `caddy validate` ДО reload (TLS всего сайта); PPR — `connection()` внутри Suspense; **HumanGate на картинку обязателен** (AI не публикует сам); прод-запись и push в main — только по явному «да» владельца (push BIZKON = `gh auth switch --user BIZKON`, потом вернуть gendirector-design); «готово» от владельца сверять прод вживую; вёрстку проверять массово, а не на паре скриншотов; grep в alpine = busybox (нет `--include`), curl в node-alpine нет. VM: `ssh root@37.77.105.82`, репо `/opt/x10-daily`. Режим: многоагентность ВКЛ (адверс-ревью Workflow перед деплоем в живой контур), высокая автономия. НЕ пересоздавай VM.
>
> **Открытое после Спеки 2:** перф deep-link (диагностика готова, фикс — инлайн-бутстрап в `<body>` с переносом hash, детали в §2 хендоффа) / фильтр `status` в `drain-post-slots` / кэш-заголовки Caddy.
