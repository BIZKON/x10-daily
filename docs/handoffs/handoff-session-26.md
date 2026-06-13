# Handoff · Session 26 — 3 правки Константина по запущенному Mini App (дата+время, реакции, обложки+статусы)

**Дата:** 13 июня 2026
**Что произошло:** Реализованы и задеплоены **3 правки Константина** (приоритет s25 §5), которые он дал после использования запущенного Mini App. Все три — чистый фронт `apps/miniapp` (БД/воркеры/автономный контур НЕ тронуты). Adversarial Workflow-ревью (34 агента) ДО деплоя поймал HIGH-находки (race в реакциях, контраст статусов, будущие даты) — устранены. Задеплоено `./deploy.sh` + live-верифицировано на проде.
**HEAD кода:** `55f41d9` · `origin/main` synced · задеплоено.
**Предыдущий handoff:** [handoff-session-25.md](./handoff-session-25.md). Inventory/доступы/грабли — memory `project_x10_deploy_state.md`.

> **ОБНОВЛЕНИЕ (та же сессия, после 3 правок):** Константин открыл запущенный Mini App и сообщил, что **реакции не ставятся**. Диагностика на проде вскрыла **🔴 критический баг входа**: реальный TG-`initData` падал на `POST /v1/auth/telegram → 401` → блокировал ВЕСЬ auth (реакции/закладки/prefs/профиль). Починено (см. §7). Затем — **закладки** (header-кнопка + экран «Сохранённое», §8). Всё подтверждено Константином вживую: вход, реакции, закладки работают.

---

## 0. TL;DR — что ЖИВО ПРЯМО СЕЙЧАС

- **Автономный контур постит сам** (без изменений): DeepSeek v4-flash, RSS→draft→слоты 4/день, IPv6-watchdog. После пересоздания контейнеров деплоем — Inngest исполняет функции, telegram по IPv6 302/0.137s, pipeline healthy.
- **Mini App** (`app.pro-agent-ai.ru`) — 3 правки ЖИВЫ:
  - **Дата+время МСК** под каждой карточкой и в читалке («13 июня, 16:43»).
  - **Живые реакции в ленте** — popover-панель 🔥/💡/🤔 с живыми счётчиками (тап → optimistic + persist).
  - **Обложки text-only** (без фоновых картинок), у deep-dive убран «воздух» над заголовком, **статус-пилюли Срочно/Горячая/Важная** рядом с золотой рубрикой.

---

## 1. Что сделано (детально)

### П1 — дата+время публикации (МСК)
- `publishedAt` добавлен в UI-тип `FeedItem` + `mapApiItem` ([lib/feed.ts]); feed API уже отдавал `effectiveAt = coalesce(publishedAt, createdAt)`.
- Новый общий форматтер [lib/format.ts] `formatPublishedAt` → «13 июня, 16:43» (`Intl` ru-RU + `Europe/Moscow`). **Абсолютное время, не относительное** — лента кэшируется PPR/«use cache», относительная метка устарела бы.
- Рендер: под карточками (news/deep-dive/daily-take, рядом с «N мин») + в читалке ([article/[slug]/page.tsx] — упразднён старый `formatDate` без таймзоны, давал сдвиг −3ч на UTC-контейнере).

### П2 — живые реакции в ленте (popover)
- Новый клиент [cards/card-reactions.tsx]: триггер (доминирующий смайл + сумма) → popover-панель 🔥/💡/🤔 с живыми счётчиками → тап = toggle.
- **State через `useOptimistic`** (как [components/article/engagement-bar.tsx] читалки) — корректные быстрые тапы, авто-откат при ошибке. Persist через server actions `toggleReactionAction`; ленивый fetch `/me` при открытии (новый `getReactionStateAction` в [lib/engagement-actions.ts]) + `loadedMineRef`-гард (поздний /me не затирает серверную правду toggle).
- Бэкенд готов с прошлых сессий: `POST /v1/articles/:id/reactions` (3 типа, toggle, требует auth, фильтр published, rate-limit) + `GET /v1/articles/:id/me`.
- ⚠️ **Карточки → «stretched link»**: `<Link absolute inset-0 z-[1]>` делает всю карточку кликабельной; реакция-контрол — `z-[2]` СИБЛИНГ ссылки (НЕ внутри `<a>` — валидный HTML, тап не навигирует). Корень БЕЗ `overflow-hidden` (иначе клипается popover; обрезку даёт обёртка обложки). Вне TG → подсказка «Откройте в Telegram». Удалён мёртвый статичный Heart/comment/bookmark-кластер.

### П3 — обложки text-only + статусы (решение Константина по скриншоту)
Константин: «реальные картинки дорого → только текст, убрать воздух сверху заголовка чтобы превью цельное/симметричное, добавить статусы как золотая рубрика».
- [cards/branded-cover.tsx] — **убрана фоновая иконка рубрики** (text-only); остался `steel→night` градиент + тонкая канон-полоса (red/gold) сверху; принимает `children`.
- **deep-dive**: без фото обложка теперь **content-driven** блок (бейджи + заголовок прижаты, симметричные отступы) — «воздух» убран; с реальным фото (редко) — прежний оверлей.
- **news без фото**: слим-градиент-хедер с **золотой пилюлей рубрики** + статусом (вместо большой пустой обложки h-44).
- **Статус-пилюли** [cards/status-badge.tsx]: **Срочно / Горячая / Важная**. Логика [lib/card-status.ts] `deriveCardStatus` — эвристика из свежести/реакций/`isFeatured` (НЕ выдуманные данные): `<3ч`→Срочно, `Σреакций≥50`→Горячая, `isFeatured`→Важная, `<24ч`→Горячая, `<72ч`→Важная, иначе нет. **Пороги легко тюнить** (по фидбеку). Live в проде: Срочно 10 · Горячая 26 · Важная 4.

## 2. ⚠️ Грабли / паттерны (подтверждены этой сессией)

- **PPR + `Date.now()`**: статус/дата вычисляются на РЕНДЕРЕ карточки (карточки — в динамической дыре `DailyFeed` после `await connection()`), НЕ в кэшируемой «use cache» data-функции → свежо на каждый запрос, не запекается. Ревью подтвердило безопасность; build оставил `/`,`/article/[slug]`,`/taxes` = ◐ PPR.
- **stretched link**: `<a>` не может содержать интерактив → реакция-контрол выносится сиблингом с `z-[2]`; ссылке нужен `aria-label` (она без текста).
- **Канон цветов в бейджах**: только red/gold/steel; статусы — `text-paper` (не `text-white`); «Важная» — `bg-red/20 border-red/50 text-paper` (контраст ≥ AA; `bg-red/10 text-red` давало ~3:1).
- **Деплой recreate**: транзиентный DNS-блип `lookup pipeline server misbehaving` в момент пересоздания — Inngest саморечит ретраями (ingest идемпотентен), не теряет данные.

## 3. Ревью + деплой + верификация
- **Adversarial Workflow-ревью ДО деплоя** (34 агента, 5 измерений × состязательная верификация): **18 подтв. / 11 опров.** Исправлено: race `wasOn` → `useOptimistic`; контраст статусов; будущие даты (guard `ageH<0`); `role="menu"` убрана + Escape + focus-visible. **Главное опровержение: PPR-безопасность `Date.now()`** (рендер в динамической дыре). Принято осознанно (фикс ревью отвергнут): stretched-link `aria-label` оставлен (ссылка без текста); backdrop оставлен кнопкой.
- **Verified:** typecheck ✅, biome (новые файлы) ✅, build ✅ (◐ PPR целы), preview (popover/optimistic/откат/DOM), **live прод**: API health 200, home — реальные статьи, П1/П2/П3 видны, **0 unsplash, 0 мок-слагов**; контур цел (IPv6/telegram/Inngest).
- **Деплой:** `4b1405e` → push main → `./deploy.sh` (VM git pull ff → build → migrate-noop → up -d).

## 4. Следующая сессия — опции (3 правки ЗАКРЫТЫ)
- **P1 — Платежи** (revenue): Telegram Stars + ЮKassa → таблица `subscriptions` есть → замкнуть paywall (`stripPaidContent` готов). Скилл `yookassa-timeweb-payments`. Нужны: ЮKassa shopId/secret + тарифы.
- **PostHog** (EU, 152-ФЗ) — измерить запуск (теперь есть юзеры + реакции): DAU/retention/воронки.
- **dedicated-бот** — ⚠️ коуплинг auth+постинг на одном токене @Sekretar_Syrov_IP_bot.
- **Фичи-потребители prefs** — персональный дайджест/push читают `user_preferences` (preference-center готов, потребителя нет).
- **Тюнинг П3-статусов** по фидбеку Константина (пороги в `deriveCardStatus`).
- **История чтения** — бэкенд `GET /v1/profile/history` ГОТОВ; построить экран как `/profile/saved` (пункт меню «История чтения» сейчас заглушка).

---

## 7. 🔴 Фикс входа в Mini App (initData HMAC) — переиспользуемая грабля

**Симптом:** Константин (первый реальный юзер) — реакции не ставятся. Логи API: `POST /v1/auth/telegram → 401` повторно → **вход падал → блокировал ВЕСЬ auth** (реакции/закладки/prefs/реальный профиль).

**Корень (найден эмпирически):** `verifyInitData` ([apps/api/src/lib/initdata.ts]) строил data-check-string, **исключая `hash` И `signature`**. Но Telegram считает **bot-token HMAC-`hash` ПОВЕРХ поля `signature`** — исключать надо **ТОЛЬКО `hash`**. ⚠️ Доковое/библиотечное «exclude hash AND signature» относится к **Ed25519 third-party** валидации (по публичному ключу Telegram), НЕ к bot-token HMAC.

⚠️ **Ловушка s25:** «auth-цепочка проверена вживую» была **самоподделкой initData тем же алгоритмом** (без поля `signature`) → проходила против самого себя; реальное Telegram-`initData` (с `signature`) — нет. Урок: НЕ верифицировать криптопроверку самоподделкой тем же кодом.

**Как нашёл:** добавил диагностику-перебор (3 парсинга × 2 исключения × 3 деривации секрета = 18 конструкций) с логом совпавшей против РЕАЛЬНОГО initData на проде → матч `decoded/excl-hash/hmac(webapp,token)`.

**Фикс:** `buildCheckString(decodedPairs, new Set(["hash"]))`; парсинг ручной `decodeURIComponent` (сохраняет `+`; URLSearchParams трактует как form-urlencoded → `+`→пробел — защитно на будущее, здесь не влияло); +clock-skew допуск 60с. Регресс-тест с `+` в query_id + полем signature, hash ВКЛЮЧАЯ signature. 29/29 api-тестов. Adversarial-ревью (13 агентов) → мультивариантный приём (страховка) убран до канон-1. **Подтверждено Константином вживую.**

## 8. 🔖 Закладки — header-кнопка читалки + экран «Сохранённое»

Toggle РАБОТАЛ (POST /bookmark 200 после фикса auth), но кнопка была спрятана внизу читалки и не было экрана списка.
- **HeaderBookmark** [components/article/header-bookmark.tsx] — кнопка в sticky-шапке читалки; ленивое состояние (`getBookmarkStateAction`) + optimistic + persist; `isPending`→`disabled` (сериализует тапы, нет out-of-order рассинхрона), cleanup hint-таймера, focus-visible.
- Закладка **убрана из engagement-бара** (там реакции+комменты) — единый контрол.
- **Экран `/profile/saved`** [app/(shell)/profile/saved/page.tsx] — список (`GET /v1/profile/bookmarks` БЫЛ готов), `SavedCard`, состояния гость/пусто/список; `connection()` в Suspense → PPR-дыра (per-user, НЕ "use cache").
- `PROFILE_MENU` «Сохранённое» → Link на /profile/saved (была мёртвая кнопка).
- Adversarial-ревью (12 агентов, 8 находок): race-fix/timer-cleanup/focus-visible внесены. **Подтверждено Константином.**

---

## Стартовый промпт для новой сессии

> Прочитай (в порядке): `docs/handoffs/handoff-session-26.md` + memory `project_x10_deploy_state.md` + CLAUDE.md. Timeweb-инфра — skill `timeweb-telegram-deploy`.
>
> Состояние: M0 + walking-skeleton ЖИВ+АВТОНОМЕН на Timeweb. **HEAD кода `55f41d9`.** Автономный постинг 4/день (DeepSeek v4-flash, IPv6-watchdog, языковой гейт «только русский»). **Mini App ЗАПУЩЕН + ВХОД РЕАЛЬНО РАБОТАЕТ** (@Sekretar_Syrov_IP_bot; фикс initData в s26 — см. §7). **s26 ЗАКРЫТО+на проде, подтверждено Константином вживую:** 3 правки (П1 дата+время МСК, П2 живые реакции popover 🔥/💡/🤔 `useOptimistic` stretched-link, П3 обложки text-only + статус-пилюли `deriveCardStatus`) + **фикс входа** (initData HMAC — исключать ТОЛЬКО hash, signature ВКЛЮЧАЕТСЯ; §7) + **закладки** (header-кнопка читалки + экран `/profile/saved`; §8).
>
> **ЗАДАЧА — опции (выбери):** P1-платежи (Stars+ЮKassa→`subscriptions`→paywall) / PostHog (измерить запуск — вход работает, есть engagement) / История чтения (бэкенд `/v1/profile/history` готов → экран как `/profile/saved`) / dedicated-бот / фичи-потребители prefs / тюнинг порогов статусов. ⚠️ Грабли: **push в main блокируется авто-классификатором на КАЖДЫЙ коммит — нужно явное «да» юзера**; деплой только `./deploy.sh`; api.telegram.org только IPv6 (watchdog, `netplan apply` НЕЛЬЗЯ); PPR — `connection()` ВНУТРИ Suspense + `"use cache"` на data-fn (per-user НЕ кэшировать); **TG initData: исключать ТОЛЬКО hash из data-check-string (signature ВКЛЮЧАЕТСЯ для bot-token HMAC); НЕ верифицировать самоподделкой тем же кодом**; миграции hand-written + журнал, `db:generate` НЕЛЬЗЯ. VM: ssh root@37.77.105.82, репо /opt/x10-daily. Режим: многоагентность ВКЛ (Workflow-ревью перед деплоем), полная автономия. НЕ пересоздавай VM.
