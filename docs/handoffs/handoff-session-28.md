# Handoff · Session 28 — ребрендинг X10 → ProAgent AI (на проде) + смена ниши источников + инфра-фиксы

**Дата:** 2026-07-22
**HEAD кода:** `616e97a` · `origin/main` synced · BIZKON/x10-daily
**Прод:** `app.pro-agent-ai.ru` = **ProAgent AI** живой, `api …/health` 200, автономный контур постит.
**Предыдущий handoff:** [handoff-session-27… (см. коммит 4d379ba)]. Полный inventory/доступы/грабли — memory `project_x10_deploy_state.md`.

---

## 0. TL;DR — что ЖИВО ПРЯМО СЕЙЧАС

- **ProAgent AI на проде** (ребрендинг X10 Daily завершён и задеплоен): бренд, рубрикатор `news/cases/howto/tools/business/founder`, разделы **Лента·Кейсы·Обучение·Я**, лид-CTA «Обсудить внедрение ИИ-агентов» → @Sekretar_Syrov_IP_bot. Канал/бот те же, юзеры сохранены.
- **Ниша источников — «ИИ-разработка/агенты для бизнеса»**: **27 active-источников** (13 YouTube-экспертов + 7 GitHub-релизов + 6 RU-ИИ-лент + рассылка). Автоконтур: parse → рерайт на русский → слот-постинг 4/день в канал «ИИ работает на вас!».
- **X10 законсервирован** (тег `x10-daily-final`, ветка `x10-legacy`, дамп БД+env в `~/x10-daily-backup/` и VM `/root/x10-archive/`, рунбок `docs/X10-RESTORE.md`).
- **PostHog** — интеграция готова, **задеплоена ВЫКЛ** (ключ не заводили).

## 1. Что сделано за сессию (по порядку)

### a) Сверка + добивка 3 правок s26
Промпт сессии был устаревшим (s26 уже случилась). 3 правки Кости (дата+время/реакции/обложки) были в проде, кроме **daily-take-карточки** — она осталась незакоммиченной. Добита (`6ecce2a`): stretched-link + optimistic-реакции + статусы + дата, как news/deep-dive.

### b) PostHog-аналитика (готова, ВЫКЛ) — `e3bbe50`
Lazy posthog-js (62KB отдельный чанк, вне 200KB-бюджета; пустой ключ → 0 байт), same-origin `/ingest` Caddy-прокси → PostHog EU, identify `tg:<id>` (псевдоним), события app_open/$pageview/article_open/reaction/bookmark/share. 152-ФЗ: autocapture OFF, session recording OFF, EU. **Ключ NEXT_PUBLIC_POSTHOG_KEY инлайнится на БИЛДЕ** (Dockerfile ARG + compose build.args). Adversarial-ревью 16 агентов. **Активация:** phc_-ключ (PostHog Cloud EU) в .env.production + rebuild miniapp. Костя ключ не дал → осталось ВЫКЛ.

### c) Консервация X10 — `b9dc49d`
Тег `x10-daily-final` + ветка `x10-legacy`; pg_dump 245МБ; env-бэкап; рунбок `docs/X10-RESTORE.md`; IPv6-watchdog вынесен в `scripts/infra/`.

### d) Ребрендинг X10 → ProAgent AI — `352eeb2` (+ катовер `31d7c3b`/`a156aaa`)
107 файлов (Workflow 6 агентов): рубрикатор сквозь БД (миграция **0012** ADD VALUE) + API + пайплайн + типы; miniapp UI; admin; voice.md + промпты 13 агентов (ИИ-для-МСБ, Smart Brevity + анти-инфобиз + анти-ИИ-хайп); CLAUDE.md v2.0. Adversarial-ревью поймал **CRITICAL** (0012+0013 в одной drizzle-транзакции → PG «unsafe use of new value» → deploy абортил; фикс — удалил лишнюю миграцию; проверено dry-run на прод-дампе). **Катовер на прод** скриптом `scripts/rebrand-cutover.sh --yes`: пауза → архив 2521 X10-статьи → deploy → смена источников → снятие паузы. Live-verified.

### e) IPv6-инцидент + durable-фикс watchdog — `77efcad`
При катовере telegram по IPv6 отвалился: DHCPv6-адрес протух по preferred_lft → **`deprecated`** → egress не идёт, а watchdog не ловил (presence-проверка матчила deprecated). Обновил лиз (dhcpcd), захардил watchdog: (1) требует global-адрес БЕЗ deprecated; (2) `accept_ra=2` на каждом тике. Telegram 302 восстановлен.

### f) Источники под новую нишу — `ebc6f0e`
Схема (миграция **0013**, обратимая varchar+default): `+adapter_type` (rss/youtube/github/reddit/x) `+status` (active/inactive/pending). Фетчер (rss-parser) универсален → youtube/github/reddit фетчатся как `kind='rss'`. **27 active** (проверены реальным fetch: 13 YouTube [channel_id резолвнут из HTML], 7 GitHub, 6 RU, 1 блог) + **8 pending** (4 Reddit — 429 IP; 1 X — нет RSS; 3 блога — фид не найден). Приёмка `scripts/verify-sources.mts` (реальный fetch + прайминг + SimHash + Masker-check) OK=27/FAIL=0. Доки `docs/parsing-sources.md`.

### g) Reddit-OAuth-адаптер (построен, ДОРМАНТ, дропнут) — `616e97a`
Построил `fetch-reddit.ts` (OAuth client_credentials → oauth.reddit.com, обход IP-429) + диспетч по adapter_type + env-плумбинг + тесты. Adversarial-ревью (3 подтв, все — путь активации, внесены). **Костя решил забить на pending** (низкая ценность: авторы уже в ленте через YouTube; RSS.app платный + мне нельзя заводить аккаунты/оплату). **Код дормантен на main** (не задеплоен, reddit-источники enabled=false → не исполняется; на след. деплое уедет безвредно). Активация в будущем: только бесплатный Reddit-app client_id/secret.

## 2. Грабли (переиспользуемо)

- **Миграции ADD VALUE:** drizzle-kit оборачивает ВСЮ пачку pending в ОДНУ транзакцию → `ADD VALUE` и использование значения (SET DEFAULT) в разных файлах НЕ спасает (PG «unsafe use of new value»). Тестировать `db:migrate` на прод-дампе ДО деплоя.
- **Деплой ТОЛЬКО `./deploy.sh`** (git pull → build → migrate → up -d). Код-изменение ingest/agents → нужен rebuild; чисто-data (источники) → можно `psql -f seed` + mount-migrate без ребилда.
- **IPv6:** DHCPv6-адрес протухает по preferred_lft → `deprecated` → egress мрёт; watchdog `/2мин` теперь ловит deprecated + держит accept_ra=2. `netplan apply` НЕЛЬЗЯ.
- **Прод-мутации / git-push:** авто-классификатор блокирует прод-DB-запись и push в main без явного «да» Кости. Push в BIZKON: `gh auth switch --user BIZKON` (потом вернуть gendirector-design). **«готово» от Кости ≠ выполнено** — сверять прод вживую (git HEAD, контейнеры Up-age, enum, curl бренда).
- **Мне НЕЛЬЗЯ:** заводить аккаунты, вводить оплату → Reddit-app/RSS.app/PostHog-ключ и т.п. добывает Костя. Публичные фиды (YouTube/GitHub/RSS) делаю сам.
- **Reddit** 429-ит datacenter-IP (нужен OAuth/мост); **X** без RSS; **YouTube** channel_id — из canonical HTML, не выдумывать.
- **psql в docker:** URL передавать АРГУМЕНТОМ (`psql "$DB"`), не через `-e U=` + `psql "$U"` (раскрывается хост-шеллом = пусто → local socket). verify-sources.mts запускать с `--env-file .env.production`.

## 3. Следующая сессия — опции

- **PostHog активация** — phc_-ключ (PostHog Cloud EU) от Кости → .env.production + rebuild miniapp. Измерить запуск (DAU/retention/воронки). Всё готово, ключа нет.
- **Наполнение ленты кейсами/обучением** — Костя пишет вручную через admin (`admin.pro-agent-ai.ru`), публикуются сразу (не ждут авто-контента). Голос основателя `about-author-founder.md` готов, но НЕ подключён к конвейеру (нужно решение — «Разбор от основателя» от первого лица).
- **Платежи** (Stars/ЮKassa → subscriptions → замкнуть paywall) — стратег. приоритет; нужны ЮKassa shopId/secret + тарифы.
- **Фирстиль** — палитра/лого/favicon сейчас как у X10 (по решению — сменить отдельным этапом; палитра = один файл `packages/ui/src/styles/theme.css`; favicon/og в репо НЕТ — создать).
- **Reddit/pending** — забиты; Reddit-OAuth-адаптер дормантен на main (нужен только бесплатный Reddit-app, если захочет).
- **Отложенное:** снизить $-потолок $15→$5; probe-user `x10_launch_probe` в прод-БД (безвреден).

## 4. Ссылки

| Хочешь | Открой |
|---|---|
| Inventory + доступы + грабли + история | memory `project_x10_deploy_state.md` |
| Карта ребрендинга (решения Кости) | `docs/REBRAND-MAP.md` (шапка «✅ Решения Константина») |
| Источники парсинга (канон) | `docs/parsing-sources.md` |
| Восстановление X10 | `docs/X10-RESTORE.md` |
| Голос + чёрный список | `packages/voice/voice.md`, `packages/voice/src/index.ts` |
| Reddit-адаптер (дормант) | `apps/workers/ingest/src/fetch-reddit.ts` + коммит `616e97a` |

---

## Стартовый промпт для новой сессии

> Прочитай (в порядке): `docs/handoffs/handoff-session-28.md` + memory `project_x10_deploy_state.md` + CLAUDE.md. Timeweb-инфра — skill `timeweb-telegram-deploy`.
>
> Состояние: **ProAgent AI ЖИВ на проде** (`app.pro-agent-ai.ru`, ребрендинг X10→ProAgent AI завершён и задеплоен). HEAD кода `616e97a`, origin synced. Автономный контур постит 4/день в канал «ИИ работает на вас!» (@Sekretar_Syrov_IP_bot): **27 active-источников** про ИИ-разработку/агенты для бизнеса (13 YouTube-экспертов + 7 GitHub + 6 RU-ИИ + рассылка) → рерайт на русский → слот-постинг. Рубрикатор news/cases/howto/tools/business/founder, разделы Лента·Кейсы·Обучение·Я. X10 законсервирован (тег `x10-daily-final`, `docs/X10-RESTORE.md`).
>
> ⚠️ Грабли: деплой ТОЛЬКО `./deploy.sh` (rebuild при код-изменениях; чисто-data-источники — `psql -f seed`+mount-migrate без ребилда); миграции hand-written + журнал, ADD VALUE тестировать db:migrate на прод-дампе (drizzle гонит всю пачку одной транзакцией → «unsafe use of new value»); api.telegram.org только IPv6 (watchdog ловит deprecated-лиз + accept_ra=2, `netplan apply` НЕЛЬЗЯ); PPR — connection() ВНУТРИ Suspense + "use cache"; прод-DB-запись/push в main блокируется классификатором без явного «да» (push BIZKON = `gh auth switch --user BIZKON`); «готово» от Кости сверять прод вживую; мне НЕЛЬЗЯ заводить аккаунты/вводить оплату (Reddit-app/PostHog-ключ/ЮKassa — от Кости). VM: ssh root@37.77.105.82, репо /opt/x10-daily. Режим: многоагентность ВКЛ (Workflow-адверс-ревью перед деплоем в живой контур), высокая автономия. НЕ пересоздавай VM.
>
> **Открытые опции (спроси Костю приоритет):** PostHog-активация (нужен phc_-ключ EU) / наполнение кейсами через admin + голос основателя / платежи (Stars+ЮKassa→paywall) / фирстиль (палитра+favicon). Reddit/pending — забиты (Reddit-OAuth-адаптер дормантен на main). PostHog задеплоен ВЫКЛ.
