# Карта ребрендинга: X10 Daily → ProAgent AI

## ✅ Решения Константина (зафиксированы 19.07.2026)

- **Р1 Бренд:** **ProAgent AI** · слоган «ИИ работает на вас» (= имя канала) · description: «Кейсы, методики и новости внедрения ИИ-агентов для малого и среднего бизнеса. Без хайпа, с цифрами выгоды.» · CTA постов «Читать в ProAgent AI →»
- **Р2 Домен:** остаётся `pro-agent-ai.ru` (совпал с брендом); мёртвые фолбэки `x10.media` в Caddy/compose → заменить на pro-agent-ai.ru
- **Р3 Палитра/шрифты:** пока ТЕКУЩИЕ (red/gold/steel, Manrope/Inter/JetBrains) — смена отдельным этапом при появлении фирстиля; favicon/og — создать позже
- **Р4 Рубрикатор (ADD VALUE в pgEnum, старые значения остаются мёртвыми):** `news` Новости ИИ (дефолт) · `cases` Кейсы · `howto` Обучение · `tools` Инструменты · `business` Практика бизнеса · `founder` От основателя (замена rybakov)
- **Р5 Разделы (bottom-nav):** Лента `/` · Кейсы `/cases` (паттерн бывш. /taxes) · Обучение `/learn` · Я `/profile`. **Удаляем:** /taxes, /video (своего видео-канала нет), /community + вся кламп-семантика
- **Р6 Источники:** RU RSS про ИИ/автоматизацию для бизнеса (vc.ru ИИ, Habr ИИ-хабы, RB.ru и т.п. — валидировать живость фидов curl-ом), угол отбора «выгода для МСБ». Прайминг seen_items обязателен
- **Р7 Канал/бот:** ТОТ ЖЕ канал (chat_id -1003773645085, Константин уже переименовал в «ИИ работает на вас!») + тот же бот @Sekretar_Syrov_IP_bot → env НЕ меняется, юзеры сохраняются
- **Р8 Голос:** авто-контент — нейтральная редакция ProAgent AI (Smart Brevity, анти-инфобиз сохраняем + анти-ИИ-хайп); ручные кейсы — от первого лица основателя; daily-take → «Разбор от основателя»
- **Р9 Premium:** paywall-CTA → лид «Обсудить внедрение ИИ-агентов» (ссылка на @Sekretar_Syrov_IP_bot)
- **Р10 Прод-данные:** X10-статьи архивировать (дамп есть), users СОХРАНИТЬ (бот тот же), sources заменить+праймить; пауза постинга — на этапе прод-миграции
- **Контент-микс:** авто ИИ-новости 4/день + кейсы/обучение вручную через админку

---

Рабочий документ ребрендинга репозитория. X10 Daily законсервирован (тег `x10-daily-final`, ветка `x10-legacy`, дамп БД и env в `~/x10-daily-backup/` и на VM `/root/x10-archive/`; восстановление — `docs/X10-RESTORE.md`). Движок (Next.js miniapp + Hono API + AI-конвейер + постинг) остаётся; меняются бренд, разделы, рубрикатор, источники парсинга, канал и голос. Инвентаризация 7 агентами: **240 бренд-связанных мест** (216 по 6 слоям + 24 пропуска, найденных критиком), из них 89 помечены «нужно решение владельца» — сведены ниже в **10 развилок**. Дата: 19.07.2026.

---

## 1. Решения владельца (развилки)

> ⚠️ **Немедленно, до любых правок:** прод-VM ДО СИХ ПОР крутит X10-постинг. Очередь `channels` со строками `posted_at IS NULL` продолжит публиковать X10-статьи в старый канал по cron-слотам. Первый шаг ребрендинга — пауза: админка `/posting` → `UPDATE posting_control SET paused=true` (глушит ingest и постинг на время миграции).

### Р1. Имя, слоган, описание бренда
Что решается: название проекта, слоган (сейчас «Деловое утро за 7 минут»), описание, имя редакции, формулировка CTA «Читать в Х10 →».
Зависит: metadata miniapp (`layout.tsx`), лого-кубик TopBar, «Х10 Новости», «X10 Admin» ×11 страниц, сайдбар админки, фраза «редакции Х10 Daily» в 9 промптах агентов, CTA в TG-постах (`telegram-html.ts:91`), README/CLAUDE.md/package.json description, текст кнопки menu button.

### Р2. Домен
Что решается: новый домен (сейчас прод на `pro-agent-ai.ru`, дефолты в коде — мёртвый `x10.media`; схема поддоменов `app./api./admin.` — движок, не меняется). Плюс живой ACME-email вместо `admin@x10.media`.
Зависит: значение `X10_BASE_DOMAIN` в `.env.production` (имя ключа не трогаем), фолбэки в `docker-compose.prod.yml` и `caddy/Caddyfile.prod`, `metadataBase`, CORS-origins, User-Agent инжеста, DNS A-записи, `login_domain` бота, `setChatMenuButton` URL, Timeweb UI (привязка домена + SSL — только через UI).

### Р3. Палитра, шрифты, лого, favicon
Что решается: новая палитра (red/gold/steel → ?), шрифты (Manrope/Inter/JetBrains Mono → ?), логотип. **Favicon/manifest/og-image/apple-icon в репо НЕТ вообще** — создавать с нуля; иконка бота — в BotFather.
Зависит: `packages/ui/src/styles/theme.css` (ЕДИНСТВЕННЫЙ источник палитры — правится в одном месте, всё остальное на токенах), `fonts.ts` ×2 (miniapp+admin), TINT в `branded-cover.tsx`, цвет-сирота `#8E5E1B` в community, `visual.md` для VisualAgent, `themeColor` в layout.

### Р4. Набор рубрик-категорий (сквозной enum)
Что решается: новая таксономия вместо `taxes/money/practice/power/tech/rybakov` + новый дефолт (сейчас `practice`) + подкатегории + словарь тегов. **Судьба именной рубрики `rybakov` — обязательное решение** (ключ прошит в API-контракт, pgEnum БД, промпт IngestAgent, UI). Значения из PG-enum не удаляются — нужна hand-written миграция.
Зависит: 17+ мест по всем слоям — полный список в §2.0.

### Р5. Состав разделов миниаппа
Что решается по каждому табу нижней навигации (сейчас: Лента / Налоги / Видео / Х10 / Я):
- `/taxes` — оставлять ли выделенный раздел-таб (тексты про НК РФ/ФНС) и под какую рубрику;
- `/video` — какой видео-канал вместо YouTube Рыбакова (хардкод `UCdOUvNFp8y6KTkswzeu7naQ` в `videos.ts:16`) или выпилить раздел;
- `/community` — есть ли у нового проекта сообщество; судьба концепта «кламп» (термин чисто рыбаковский, существовать в новом бренде не может): переименовать сущность / переделать экран / убрать (таблица `klamps` в проде ПУСТАЯ — любая опция дешёвая);
- типы событий (enum `event_type` c `kod-x10`) — линейка событий нового проекта или выпил раздела;
- флагман-автор и формат daily-take «реакция дня» (см. Р8).

### Р6. Источники парсинга
Что решается: новый список RSS вместо 5 деловых (vc.ru, Forbes, Коммерсантъ, РБК, Habr) + критерии accept/reject IngestAgent (сейчас деловая повестка + анти-инфобиз-фильтр).
Зависит: `scripts/seed-sources.sql`, прод-таблица `sources` (data-driven — движок кода не трогается), промпт `ingest.ts`. ⚠️ Каждый новый источник ОБЯЗАТЕЛЬНО праймить (`mark-all-as-seen` в `seen_items`), иначе первый тик выстрелит всем backlog'ом.

### Р7. Бот и канал постинга
Что решается: (а) остаётся `@Sekretar_Syrov_IP_bot` или новый dedicated-бот; (б) новый контент-канал вместо текущего (тест был `@delovoy_vestnik`); (в) включать ли VK; (г) ops-чат (можно оставить).
⚠️ **Auth Mini App (HMAC initData), постинг и алерты сидят на ОДНОМ токене** — смена бота атомарна: новый `TELEGRAM_BOT_TOKEN` + бот админом нового канала + заново `setChatMenuButton` (Bot API, НЕ BotFather) + `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` + `/setdomain` (login_domain админ-виджета, один на бота) + redeploy. **Юзеры в БД валидны только при том же боте** (см. Р10).

### Р8. Голос / ToV / флагман-автор
Что решается: новый голос редакции. Точка рычага — 3 файла `packages/voice/*.md`, инжектятся целиком в промпты: перегенерация автоматически перекрашивает Draft/ToV/SocialAmplify/Newsletter. Сохраняем каркас-движок: Smart Brevity 6 блоков, ритм 14 слов, правила цитат/цифр, 10 absence-signals, языковой гейт «только русский». BLACKLIST пересобрать: универсальную анти-инфобиз-часть оставить, рыбаков-специфику («соборное мышление» и пр.) заменить лексикой новой ниши. Плюс: кто флагман-автор (daily-take «реакция дня», колонка `digests.rybakov_take`, flagship в authors), нужны ли `about-author-*.md` (механизм готов, файлов нет), состав 7 секций newsletter.

### Р9. Premium-тариф
Что решается: название («Х10 Premium») и цена (1 500 ₽/мес) — захардкожены в одном месте UI (`profile/page.tsx:124`); платёжного флоу за кнопкой НЕТ (Stars/ЮKassa — только enum'ы в схеме). Вариант: скрыть кнопку до реализации платежей. Enum'ы tier/provider — движок, не трогаются.

### Р10. Судьба прод-данных
Что решается: чистка БД. Статьи (330+), дайджесты, ingest_items, events, authors — чистить (дамп снят, восстановимо). **users: тот же бот → оставить** (только обнулить `subscribed_categories`); **новый бот → чистить** (аудитория старого бота нерелевантна; subscriptions/preferences уйдут каскадом). Порядок: пауза постинга → чистка → смена канала/токена.

### Второстепенные развилки
- PostHog: завести новый проект под бренд (рекомендуется — X10-данных там нет, PostHog запушен но не задеплоен) или переименовать старый; менять значение `NEXT_PUBLIC_POSTHOG_KEY`.
- Имя БД `x10`, S3-бакет `x10-images`, имя репо `x10-daily` — рекомендация ОСТАВИТЬ (юзеру невидимы).
- `docs/DEPLOY.md` — переписать под фактический Timeweb-деплой или пометить «архив, см. deploy.sh» (сейчас вдвойне врёт: старый бренд + мёртвый CF/Vercel-путь).
- `.github/workflows/preview.yml` (Vercel legacy) — удалить или оставить спящим.
- Расписание постинга (слоты 4/день 09:30–18:30 МСК) и расписание дайджестов morning/lunch/evening — менять только при желании, движок.

---

## 2. Чек-лист по слоям

### 2.0. Смена рубрикатора — сквозная правка (кросс-слой, зависит от Р4)

Источник истины → миграция → API → воркеры → UI. Менять СИНХРОННО, одной пачкой, вместе с тестами (§2.7).

- [ ] `packages/db/src/schema/articles.ts:47-54` — pgEnum `article_category` (истина) → новый набор; `:77` — `default('practice')` → новый дефолт; `:78-79` — комментарий subcategory с примерами старой таксономии
- [ ] `packages/db/drizzle/` — **новая hand-written миграция 0012+** (`db:generate` НЕЛЬЗЯ — правило проекта, прецедент 0001): `CREATE TYPE article_category_new` → `ALTER TABLE articles ALTER COLUMN category DROP DEFAULT; ALTER COLUMN ... TYPE ... USING (CASE category::text WHEN 'taxes' THEN '...' ... END)` → `SET DEFAULT` → `DROP TYPE` старого → `RENAME`. CASE-маппинг старых→новых рубрик — решение владельца. Тот же паттерн для `event_type`. Миграции 0000–0011 НЕ редактировать
- [ ] `packages/db/src/schema/user_preferences.ts:31-35` — data-миграция значений `subscribed_categories text[]` (это text[], enum-механики не требует; иначе тумблеры подписок отвалятся молча) + комментарий
- [ ] `apps/api/src/routes/feed.ts:12` — zod-enum фильтра ленты
- [ ] `apps/api/src/routes/admin.ts:34` — zod-enum админ-очереди
- [ ] `apps/api/src/routes/profile.ts:35` — `CATEGORIES as const` валидации preferences
- [ ] `apps/workers/pipeline/src/events.ts:17-19` — `categoryEnum` + `DEFAULT_CATEGORY='practice'` (⚠️ при смене id Inngest-функции — re-sync PUT pipeline:8787 из контейнера api)
- [ ] `apps/workers/pipeline/src/persist.ts:155-165` — union-тип category в PersistInput (section-union — legacy-движок, НЕ трогать)
- [ ] `packages/agents/src/agents/ingest.ts:22-29,140-154` — `INGEST_CATEGORIES` + CATEGORY-маппинг с описаниями + список подкатегорий (`rybakov.daily/essay/podcast/qa` — убрать)
- [ ] `apps/miniapp/src/lib/api.ts:13` — тип `ApiCategory` (ключ `rybakov` прошит в API-контракт)
- [ ] `apps/miniapp/src/lib/feed.ts:70-87` — `HOME_CATEGORIES` (порядок чипов = приоритет) + `CATEGORY_LABELS` («РЫБАКОВ ГОВОРИТ» — убрать)
- [ ] `apps/miniapp/src/lib/profile.ts:126-147` — `DEFAULT_PREFERENCES` + дубль CATEGORY_LABELS для закладок
- [ ] `apps/miniapp/src/components/profile/preference-toggles.tsx:9-16` — CATEGORIES тумблеров («Рыбаков говорит»)
- [ ] `apps/miniapp/src/components/cards/branded-cover.tsx:12-19` — TINT-карта рубрика→цвет (ключи = ApiCategory; цвета — синхронно с новой палитрой Р3)
- [ ] `apps/admin/src/app/page.tsx:12-28` — CATEGORY_LABELS + CATEGORY_KEYS очереди HumanGate (лейбл «Рыбаков»)
- [ ] `apps/admin/src/lib/api.ts:9` — тип `AdminCategory` (третий дубль enum'а)
- [ ] `apps/admin/src/app/rubrics/page.tsx:30-126,133-137,199-205` — редакционный справочник рубрик перегенерить целиком (why/cadence/бенчмарки, «герои Х10 Васляев-Воронов…», подрубрики; ссылка на docs/strategy — убрать). Подкатегории — open string, миграции БД не требуют
- [ ] Рекомендация: вынести единый shared-enum категорий в `@x10/config` или `@x10/db` вместо 6+ дублей
- [ ] Тесты рубрикатора: `packages/agents/test/agents.test.ts:742,766` (⚠️ regex `/rybakov\s+—/` прямо ассертит старую таксономию в system-промпте), `apps/api/test/digests.test.ts:14` — см. §2.7

### 2.1. Слой 1 — Бренд-строки и визуал (miniapp / admin / packages/ui)

- [ ] `apps/miniapp/src/app/layout.tsx:8-21` — metadata: title «X10 Daily — Деловое утро за 7 минут», description «…медиа сообщества Рыбакова…», metadataBase `https://daily.x10.media` (не совпадает даже с прод-схемой — должно стать `https://app.<домен>`); themeColor `#0B0B0E` — только при смене палитры
- [ ] `apps/miniapp` и `apps/admin` — **favicon/manifest/robots/og-image/apple-icon отсутствуют в репо** → создать с нуля под новый бренд (иконка бота — BotFather, вне репо)
- [ ] `apps/miniapp/src/components/top-bar.tsx:22-27` — лого-кубик «X10» (одно место, расходится на все экраны)
- [ ] `apps/miniapp/src/app/(shell)/page.tsx:12` — TopBar «Х10 Новости»
- [ ] `apps/miniapp/src/components/hero-digest.tsx:32,40-51,75-78` — тексты нейтральные, но тон X10 → адаптировать под новый голос; градиент подтянется из токенов сам
- [ ] `packages/ui/src/styles/theme.css:18-81` — **единственный источник палитры** (@theme: red/gold/steel/night + light-набор + шрифтовые стеки + блок `.x10-callout`) → новая палитра меняется ТОЛЬКО здесь, globals.css обоих приложений наследуют var()
- [ ] `apps/miniapp/src/lib/fonts.ts` + `apps/admin/src/lib/fonts.ts:1-21` — next/font Inter/Manrope/JetBrains Mono → при смене шрифтов менять оба + стеки `--font-*` в theme.css синхронно
- [ ] `apps/miniapp/src/app/(shell)/community/page.tsx:11-15` — TONE_BG: хардкод `#8E5E1B` ВНЕ токенов (единственный цвет-сирота слоя) → в токен или пересчитать
- [ ] `apps/admin/src` (11 файлов) — «X10 Admin» в metadata: `layout.tsx:9`, `login/page.tsx:63`, `authors/new:6`, `digests/new:6`, `events/new:6`, `klamps/new:6`, `video:3`, `rubrics:5`, `cost:5`, `posting:7`, `pipeline-config:17` + `[agent]:16` → пакетный find-replace
- [ ] `apps/admin/src/components/sidebar.tsx:30-33` — лого-кубик «X10» + подпись Admin
- [ ] Dev-моки (в прод не попадают, кроме ⚠️ MOCK_STATS — см. §2.2; приоритет низкий, для демо важен): `apps/miniapp/src/lib/feed.ts:151-232,268-275` (статьи «Игорь Рыбаков», slug rybakov-no-startup-2026), `apps/admin/src/lib/mocks.ts:67-72,254-476` (автор «грандмастер Х10», клампы, «КОД Х10 2026»)

### 2.2. Слой 2 — Разделы и навигация (зависит от Р5)

- [ ] `apps/miniapp/src/components/bottom-nav.tsx:14-20` — 5 табов: Лента / Налоги / Видео / **Х10** / Я → новый состав разделов + лейблы + иконки

**Раздел /taxes:**
- [ ] `apps/miniapp/src/app/(shell)/taxes/page.tsx` (особ. 10-22, 41) — hero про НК РФ/ФНС, `loadCategoryFeed("taxes")`, empty-state → судьба раздела + переименование роут-папки (= URL); механика страницы (PPR/Suspense) не трогать

**Раздел /video:**
- [ ] `apps/api/src/routes/videos.ts:15-17` — **хардкод YouTube-канала Рыбакова** `UCdOUvNFp8y6KTkswzeu7naQ` + RSS-URL → новый channel_id (лучше вынести в env; ⚠️ новый env-ключ → добавить в `readBindingsFromEnv`) или выпилить `/v1/videos`
- [ ] `apps/miniapp/src/app/(shell)/video/page.tsx:11,22-24,33-36` — «Свежие выпуски с канала Игоря Рыбакова»
- [ ] `apps/admin/src/app/video/page.tsx:6-10,36,45,99-121` — бейдж «Канал Рыбакова», ссылка youtube.com/@rybakovigor, «~6M подписчиков», планы rybakov.podcast; ссылки на docs/strategy убрать

**Раздел /community (клампы):**
- [ ] `apps/miniapp/src/app/(shell)/community/page.tsx:20,46-49,85-98,108-110` — весь экран: «Сообщество Х10», «Движение Х10», «Твой кламп»/«Вступи в кламп», хардкод города «Краснодар» (:110)
- [ ] `apps/miniapp/src/lib/community.ts:91-128,134-138` — ⚠️ **ПРИОРИТЕТ: MOCK_STATS (30 885 кламперов / 124 города) отдаётся И В ПРОДЕ** как fallback `loadCommunityStats` при пустой `klamps` — новый бренд покажет цифры сообщества Рыбакова; + MOCK_EVENTS («X10 Business Meet Up by Rybakov»)
- [ ] `apps/miniapp/src/lib/feed.ts:397-402` — COMMUNITY_PATHS: «Создать свой кламп», «Развивать Х10 в городе»
- [ ] `apps/miniapp/src/app/article/[slug]/page.tsx:147-164` — CTA-блок читалки: «✦ Х10 Сообщество», «Обсудить в своём клампе», мёртвая кнопка «Открыть в Х10 →» (без href) → переписать или удалить блок
- [ ] `apps/admin/src/app/klamps/` (page.tsx:27-91, new/page.tsx:6-22, [slug]/page.tsx:46-56, klamp-form.tsx:21,52) — CRUD «Клампы» целиком: «Сообщество Х10: N клампов», «Новый кламп», placeholder «Кламп «Цифровой прорыв»»
- [ ] `apps/admin/src/components/sidebar.tsx:42` — пункт меню «Клампы» (+ пересмотр состава разделов после решений по клампам/видео)
- [ ] `packages/db/src/schema/klamps.ts` — таблица klamps (пустая в проде): DROP или переименовать миграцией — см. §2.6

**Раздел /profile:**
- [ ] `apps/miniapp/src/app/(shell)/profile/page.tsx:116,124` — «Участник Х10» + кнопка «Активировать Х10 Premium · 1 500 ₽/мес» (единственное место цены в коде; флоу оплаты за кнопкой нет) — Р9
- [ ] `apps/miniapp/src/lib/feed.ts:410-421` — PROFILE_MENU: пункт «Х10 Premium» (crown)
- [ ] `apps/miniapp/src/lib/profile.ts:113-115` — гость-инициал «Х», fallback «Читатель Х10»
- [ ] `apps/miniapp/src/components/profile/preference-toggles.tsx:18-22` — SLOTS дайджестов: вечерний «Что обсуждают в Х10» (ключи morning/lunch/evening завязаны на user_preferences — не трогать)

**События:**
- [ ] `packages/db/src/schema/events.ts:19-25` — pgEnum `event_type`: `kod-x10` (бренд прямо в значении), breakfast=«кламперский завтрак», festival=«PRO Женщин» → миграция enum (паттерн §2.0) + чистка прод-строк
- [ ] `apps/admin/src/app/events/page.tsx:7` + `events/event-form.tsx:13` — лейбл «КОД Х10»
- [ ] `apps/miniapp/src/lib/api.ts:208` — тип `ApiEventType`

**Флагман-автор / daily-take / rybakov_take (сквозная цепочка, зависит от Р8):**
- [ ] `packages/db/src/schema/digests.ts:26-29,48` — тип `RybakovTake` + jsonb-колонка `rybakov_take` (имя Рыбакова в ИМЕНИ КОЛОНКИ БД) → решение: `RENAME COLUMN` миграцией в нейтральное или оставить внутренним (юзеру не видно, риск ниже); комментарии обновить в любом случае
- [ ] `apps/api/src/routes/digests.ts:55-56,74-90,197-206` — `SYNTHETIC_DIGEST_INTRO` «Главные деловые сюжеты дня…» (ниша) + поле `rybakovTake` в контракте hero
- [ ] `apps/api/src/routes/admin-content.ts:127-141` — `rybakovTakeSchema` (zod) в digestCreate/Update
- [ ] `apps/miniapp/src/lib/api.ts:150` — поле `rybakovTake` в ApiDigest
- [ ] `apps/admin/src/app/digests/digest-form.tsx:6,53-54` + `digests/actions.ts:37-39` — JSON-поле «rybakovTake» в форме выпуска
- [ ] `apps/admin/src/app/authors/page.tsx:28` + `authors/author-form.tsx:22-29,47` — «Flagship = ★ Игорь Рыбаков», плейсхолдеры «igor-rybakov»/«Игорь Рыбаков» (механизм isFlagship — движок)
- [ ] `apps/miniapp/src/components/cards/daily-take-card.tsx:16-19,50-52` — лейбл «· реакция дня» (= ежедневное мнение Рыбакова), fallback-автор «Редакция»
- [ ] `packages/agents/src/agents/draft.ts:59-68` — TEMPLATE_GUIDANCE daily-take: «Авторский голос (Рыбаков обычно)»
- [ ] `packages/config/src/constants.ts:82` — (критик) коммент «реакция автора (Рыбаков), короткая»

### 2.3. Слой 3 — AI-промпты и голос (зависит от Р6, Р8)

**Ядро бренда — packages/voice (перегенерация = автоперекраска Draft/ToV/SocialAmplify/Newsletter):**
- [ ] `packages/voice/about-me.md:1-47` — фундамент: «медиа движения Х10», кламперы (30 885), 4 столпа, brand promise, off-limits (Шабутдинов, личная жизнь Рыбакова) → перегенерить полностью; инжектится ЦЕЛИКОМ в DraftAgent — главная точка рычага
- [ ] `packages/voice/voice.md:1-131` — голос: примеры хуков, signature phrases, off-limits-лексика → перегенерить; каркас (Smart Brevity 6 блоков, ритм 14 слов, правила цитат/чисел, 10 absence-signals) — движок, сохранить
- [ ] `packages/voice/visual.md:1-110` — палитра red/gold/steel, запрет лиц «Рыбаков, кламперы», привязка к столпам Х10 → перегенерить при смене палитры (VisualAgent выключен — не блокер запуска)
- [ ] `packages/voice/src/index.ts:26-57` — BLACKLIST ~30 слов → пересобрать: универсальный анти-инфобиз оставить, рыбаков-специфику («соборное мышление», «миллион сердец»…) заменить лексикой новой ниши
- [ ] `packages/voice/src/index.ts:59-70` — `loadAuthorVoice`: файлов `about-author-*.md` НЕТ (заглушка возвращает null) → создать под новых спикеров, если будут авторские колонки; код не менять

**Промпт IngestAgent = направления парсинга:**
- [ ] `packages/agents/src/agents/ingest.ts:119-139` — блок «КОНТЕКСТ Х10» («кламперы Рыбакова и предприниматели») + критерии accept/reject (анти-инфобиз Like Центра) → переписать под тематику/аудиторию нового проекта; анти-инъекционная обвязка (62-117, 186-206) и механика decision/relevanceScore — движок, НЕ трогать
- [ ] `packages/agents/src/agents/ingest.ts:162-168` — словарь TAGS: `#Рыбаков #Х10 #кламп` убрать, деловые теги (#УСН #ФНС #ЦБ…) → под новую нишу
- [ ] `packages/agents/src/agents/ingest.ts:44-51,170-174` — формулировки REJECT_REASON (коммент «не релевантно Х10») обновить; критерии POLITICAL (триггер FactCheck/Opus) — движок безопасности, НЕ трогать
- [ ] Таксономия INGEST_CATEGORIES — см. §2.0

**«Редакции Х10 Daily» — пакетная замена имени в 9 промптах (только имя, механика не трогается):**
- [ ] `draft.ts:86` · `tov.ts:27` · `social-amplify.ts:106` · `hookgen.ts:46` · `factcheck.ts:67` · `brevity.ts:36` · `newsletter.ts:34` · `preview-score.ts:55` (2 места) · `score-weekly.ts:73` (все — `packages/agents/src/agents/`)

**Каналы дистрибуции в промптах (зависит от Р7):**
- [ ] `packages/agents/src/agents/social-amplify.ts:62-95` — CHANNEL_RULES: tg-rybakov («первое лицо… чат кламперов»), tg-x10 (CTA «читать полностью на x10daily»), zen («продолжение в Х10 Daily»), vk, linkedin → переписать под каналы нового проекта: чей голос, какие CTA
- [ ] `packages/agents/src/agents/hookgen.ts:24,55-61` — enum HOOK_CHANNELS (`tg-rybakov`/`tg-x10`) + CHANNEL_LINES-описания → описания переписать; сами enum-ID прошиты также в social-amplify (DEFAULT_FRAMEWORK) и `pipeline/draft-article.ts:301,309` и оседают в articles.metadata → либо оставить внутренними ID, либо менять одной согласованной правкой agents+pipeline+тесты
- [ ] `apps/admin/src/app/pipeline-config/agent-meta.ts:151` — описание SocialAmplifyAgent «Конвертирует в TG-Рыбакова / TG-X10 / VK / Дзен / LinkedIn»

**Прочее:**
- [ ] `packages/agents/src/agents/hookgen.ts:63-88` — примеры хуков деловой ниши (ЦБ, Греф, МСП) + `:81` отсылка «чёрный список Х10» → примеры под новую нишу (сильно направляют модель); 6 паттернов хуков — движок
- [ ] `packages/agents/src/agents/newsletter.ts:72-115` — enum 7 русских секций выпуска (решение Р8, синхронен с output-схемой) + `:105` CLOSING-CTA «пригласить в сообщество кламперов» — заменить обязательно
- [ ] `apps/workers/pipeline/src/inngest/functions/draft-article.ts:82,512` — ops-алерты «🛑 X10 pipeline: дневной бюджет…» — юзеру невидимы, по желанию

### 2.4. Слой 4 — Источники парсинга и каналы публикации (зависит от Р6, Р7)

**Источники (data-driven — код движка не трогается):**
- [ ] `scripts/seed-sources.sql:14-26` — заменить VALUES (Forbes.ru, Коммерсантъ, РБК, Habr; vc.ru засеян отдельно в s18) на новые источники; URL проверять живьём с РФ-VM (HTTP 200 + валидный RSS); анти-флуд-комментарий в шапке (5-7) сохранить
- [ ] Прод-таблица `sources` — старые `UPDATE sources SET enabled=false` (или DELETE — тогда seen_items уйдут каскадом), новые INSERT
- [ ] ⚠️ **Прайминг seen_items ОБЯЗАТЕЛЕН** для КАЖДОГО нового источника (mark-all-as-seen первым фидом; процедура — `docs/handoffs/handoff-session-18.md` §4), иначе первый тик ingest-rss выстрелит всем backlog'ом в конвейер
- [ ] `apps/workers/ingest/src/fetch-rss.ts:44` — User-Agent `x10-daily-ingest/0.1 (+https://x10.media)` — старый бренд + мёртвый домен в каждом запросе → честный UA нового проекта

**TG-пост (шаблон):**
- [ ] `apps/workers/pipeline/src/lib/telegram-html.ts:91` — «Читать в Х10 →» — единственная видимая читателю бренд-строка шаблона поста (+комменты :15-16,65) → менять ОДНИМ коммитом с тестом `telegram-html.test.ts:23,32` (§2.7); CALLOUT_LABEL «Почему важно./Да, но./Что дальше.» — движок

**Бот и канал (в основном вне git — .env.production + Bot API):**
- [ ] `.env.production` на VM — `TELEGRAM_BOT_TOKEN` (@Sekretar_Syrov_IP_bot), `TG_TEST_CHANNEL_ID` (контент-канал; имя ключа «TEST» — историческое, не трогать), `TG_OPS_CHAT_ID` → новые значения по Р7; редеплой ТОЛЬКО `./deploy.sh` или `docker compose --env-file .env.production` (иначе crash-loop)
- [ ] Бот — админ нового канала (ручная операция в Telegram); канал в коде нигде не захардкожен (`post-channel.ts` берёт только env)
- [ ] Menu button — `setChatMenuButton` через Bot API (НЕ BotFather): новый текст кнопки (сейчас «Х10 Daily») + URL миниаппа `app.<домен>`
- [ ] (критик) `apps/admin/src/components/tg-login-widget.tsx:14,26,46,63,74` — вход в админку привязан к боту: значение `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` + `/setdomain` в BotFather на новый admin-домен (один login_domain на бота); callback `__x10_tg_auth` — техническое, не трогать
- [ ] `apps/workers/pipeline/src/lib/vk.ts` — VK-постинг выключен (env пусты) → при включении: сообщество нового бренда + `VK_ACCESS_TOKEN` (право wall) + `VK_OWNER_ID`; код не менять
- [ ] `scripts/post-one-now.mts` — движок; после смены env использовать как smoke-тест постинга в новый канал

### 2.5. Слой 5 — Инфра, домены, документация (зависит от Р1, Р2)

- [ ] `docker-compose.prod.yml:83,124-126,175,206,229-230` — фолбэки `${X10_BASE_DOMAIN:-x10.media}` (5 мест) + `${CADDY_ACME_EMAIL:-admin@x10.media}` → новый домен или убрать дефолты, чтобы падало громко
- [ ] `caddy/Caddyfile.prod:7,11,17,48,62` — те же фолбэки в 3 vhost + ACME-email `admin@x10.media` (критик: при пустом env Caddy пойдёт за TLS на ЧУЖОЙ домен; письма Let's Encrypt о протухании — в никуда) → новый домен + живой ящик; PostHog `/ingest`-прокси (:20-33) — движок, не трогать
- [ ] `.env.example:5-9,15-22,56-65,90-93,99-108` — примеры-значения старого бренда: `X10_BASE_DOMAIN=x10.media`, ACME-email, DSN с БД `x10`, origins, пример канала `@x10_test_channel`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, `S3_BUCKET=x10-images` → обновить (шаблон — источник копипасты следующего деплоя); имена ключей не трогать
- [ ] `packages/config/src/env.ts:82-87` + `apps/workers/pipeline/src/bindings.ts:34` — комменты про pro-agent-ai.ru и «Читать в Х10» — косметика при правке CTA/домена
- [ ] `package.json:5` — description «X10 Daily — ежедневное мини-апп-медиа…» (+ устаревшее «CF Workers/Neon») → переписать; `name` — по желанию (Р-мелкие)
- [ ] (критик) `README.md:1-78` — целиком X10 (Рыбаков, «клампские чаты», ссылки на X10-PDF) + устаревший стек CF/Neon/Vercel → переписать под новый бренд и фактический Timeweb; ⚠️ **репо ПУБЛИЧНЫЙ** (trade-controls BIZKON) — витрина, приоритет выше обычной доки
- [ ] (критик) `CLAUDE.md:1-260` — первый файл каждой сессии Claude Code, целиком X10-контекст → будет уводить ИИ в старый бренд; перегенерить секции 1, 4 (частично), 5, 6, 9, 10; технические (стек, монорепо, метробюджеты, рабочие правила, graphify) сохранить. Делать ПОСЛЕДНИМ, когда все решения приняты
- [ ] (критик) `docs/DEPLOY.md:1,58,128-152,190-340,461` — вдвойне устаревший (X10-имена + мёртвый CF/Vercel-путь; реальный рунбок = deploy.sh + X10-RESTORE.md) → переписать под Timeweb или пометить шапкой «архив»
- [ ] `.github/workflows/preview.yml:20-24` — legacy Vercel-preview (шаги скипаются без секретов) → удалить или оставить спящим
- [ ] `.claude/settings.local.json:25,29` — устаревшие permissions с URL info.pro-agent-ai.ru — косметика
- [ ] (критик) PostHog: `apps/miniapp/src/lib/analytics.ts` — код нейтрален, но значение `NEXT_PUBLIC_POSTHOG_KEY` указывает на PostHog-проект X10 → новый проект (рекомендуется, X10-данных нет — PostHog не задеплоен) + новое значение env при деплое
- [ ] (критик) `apps/workers/newsletter/` — пустая заглушка (только package.json, src/ нет), email-шаблонов НЕ существует → сейчас менять нечего; при реализации: from-адрес/имя отправителя/футер нового бренда + double opt-in
- [ ] **Вне git, на прод-VM/внешних сервисах:** `.env.production` в `/opt/x10-daily` (домен `pro-agent-ai.ru`, бот, канал, ops-чат, S3; бэкап старого env — `/root/x10-archive/`) · DNS A-записи `app./api./admin.` на новый домен (Caddy сам перевыпустит TLS) · привязка домена в Timeweb UI (только UI + редеплой для SSL) · BotFather login_domain · setChatMenuButton

### 2.6. Слой 6 — Схема БД и прод-данные (зависит от Р4, Р5, Р10)

**Порядок операций критичен:**
- [ ] Шаг 1: `UPDATE posting_control SET paused=true` (id='global') — ⚠️ ДО любой чистки: очередь `channels` с `posted_at IS NULL` иначе продолжит постить X10 в старый канал (VM крутит постинг прямо сейчас)
- [ ] Шаг 2: `DELETE FROM articles` (330+ X10-статей) — каскадом уйдут reactions, bookmarks, user_reading_history, article_embeddings, **channels** (очередь постинга) и pipeline_runs(article_id); дамп снят — восстановимо
- [ ] Шаг 3: `DELETE FROM digests` — явно (top_article_ids — jsonb-ссылки БЕЗ FK, каскадом не уйдут)
- [ ] Шаг 4: `DELETE FROM ingest_items` (частично уйдёт каскадом при удалении sources) + чистка/замена `sources` (§2.4) + пере-прайминг `seen_items`
- [ ] Шаг 5: `events`, `authors` — удалить сид-строки («КОД Х10 2026», «X10 Business Meet Up by Rybakov», Рыбаков slug=igor-rybakov, «редакция Х10») → заменить сущностями нового проекта
- [ ] Шаг 6: `users` — по Р10: тот же бот → ОСТАВИТЬ + `UPDATE user_preferences SET subscribed_categories='{}'`; новый бот → DELETE (subscriptions/preferences/uploads_log уйдут каскадом)
- [ ] Шаг 7: снять паузу постинга после переключения канала/источников

**Схема (миграции — только hand-written 0012+, см. §2.0):**
- [ ] `article_category` + default — §2.0
- [ ] `packages/db/src/schema/events.ts:16-25` — enum `event_type` (`kod-x10`) — пересоздание тем же паттерном
- [ ] `packages/db/src/schema/klamps.ts` — таблица пуста: DROP TABLE миграцией (если сообщества нет) или переиспользовать/переименовать (если есть); синхронно с admin/klamps и miniapp «Мой кламп». Уточнение критика ожиданий: таблицы `user_clump_memberships` НЕ существует — членство не реализовано, чистить нечего
- [ ] `packages/db/src/schema/digests.ts` — колонка `rybakov_take`: RENAME или оставить (см. блок «Флагман» §2.2)
- [ ] `packages/db/src/schema/authors.ts:15-22,29,37-38` — комментарии «Игорь Рыбаков — главный голос» (механизм is_flagship — движок)
- [ ] `packages/db/src/schema/user_preferences.ts:31` — комментарий со старой таксономией
- [ ] `article_template` (`daily-take`) — enum НЕ трогать; решение продуктовое (используется ли формат — Р8)
- [ ] `pipeline_runs` с `article_id IS NULL` — опционально добить DELETE для чистоты; `pipeline_config` (рабочие пороги) и `cost_alerts` — НЕ трогать, переживают ребрендинг
- [ ] `scripts/seed.ts:1-600` — сид целиком X10 (Рыбаков «грандмастер Х10», 10 клампов, «КОД Х10 2026», rybakovTake, юзер «Пилотный клампер») → перегенерить после решений; старый seed на вычищенной БД НЕ запускать

### 2.7. Тесты с брендовыми ассертами (критик; любая бренд-правка без них = красный CI)

Правило: бренд-строка в коде и её тест меняются ОДНИМ коммитом; `pnpm test` после каждой пачки правок.

- [ ] `apps/workers/pipeline/test/telegram-html.test.ts:23,32` — прямой ассерт `<a href="https://app.pro-agent-ai.ru/article/...">Читать в Х10 →</a>` → синхронно с `telegram-html.ts:91` + сверить домен фикстуры
- [ ] `apps/workers/pipeline/test/draft-article.test.ts:116,118,351,402,416,771` — ассерты equality на channel `tg-x10`, посты «Читать на x10daily»
- [ ] `apps/workers/pipeline/test/text.test.ts:21-23,99` — «Тестовый TG-пост… канала Х10»
- [ ] `apps/workers/pipeline/test/walking-skeleton.e2e.test.ts:171-173,338,472` — `TG_TEST_CHANNEL_ID="@x10_test_channel"` (ассерт chat_id), цитата «Игорь Рыбаков»; фикстура `VC_RSS_URL` (`fetch-rss.ts:20`) — косметика
- [ ] `apps/workers/pipeline/test/persist.test.ts:42-44` — бренд-фикстуры
- [ ] `packages/agents/test/agents.test.ts:365-488,542,742,766,856` — «Channel: tg-x10», reasoning «Топ-статьи Х10», ⚠️ `:766` regex `/rybakov\s+—/` на system-промпт IngestAgent (сломается при смене таксономии), `:856` closing «Подпишитесь на ежедневный X10 Daily»
- [ ] `apps/api/test/videos.test.ts:4-33` — фикстура Atom-фида канала «Игорь Рыбаков» → перегенерить из фида нового канала (критик проверил: фильтрация в videos.ts структурная, скрытого хардкода по имени нет)
- [ ] `apps/api/test/digests.test.ts:14,26,35-40` — негативный ассерт `not.toMatch(/Рыбаков|«|»/)` — имя заменить на нового флагман-автора, смысл теста (анти-выдуманная-цитата) сохранить — это движок качества

### 2.8. Не переименовываем / не трогаем

Технические имена — внутренние, юзеру невидимы; переименование = высокий риск (env на прод-VM, compose, bindings, импорты) при нулевой пользе:

- Workspace-пакеты `@x10/*` (pnpm-workspace, tsconfig paths, Dockerfile `--filter`, CI `ci.yml:66`)
- Env-ключи `X10_*` (`X10_BASE_DOMAIN`, `X10_JWT_SECRET`, `X10_ALLOWED_ORIGINS`, `X10_API_BASE_URL`, `X10_DEMO`, `X10_IMAGES_PUBLIC_BASE`…) — меняются только ЗНАЧЕНИЯ; ⚠️ грабля: новый env-ключ воркера всегда добавлять в `readBindingsFromEnv` (`bindings.ts`)
- CSS-классы `x10-callout`/`x10-num`, токен `--ease-x10`, cookie `x10_session`, callback `__x10_tg_auth`
- `TOOL_NAME_PREFIX = "x10_emit_"` (`packages/agents/src/define-agent.ts:56`) — расхождение промпта и tool-имени ломает конвейер
- Docker-сервисы compose, имена контейнеров `x10-daily-*`, путь `/opt/x10-daily` на VM, dev-креды Postgres `x10/x10dev`, имя прод-БД `x10`
- Inngest app id `x10-pipeline` (`pipeline/src/inngest/client.ts:17`) — смена = новое приложение + re-sync + осиротевшая история ранов
- Systemd-юниты IPv6-watchdog `scripts/infra/` (`x10-ipv6-ensure.*`, `99-x10-ipv6.conf`) — установлены на VM, критичны для Telegram-egress
- `/health` service-имя `x10-api` (`health.ts:7` + тесты) и лог-теги `[x10-api]` — при желании чистоты менять парой health.ts+health.test.ts одним коммитом
- PG-типы `article_category`/`event_type`/`subscription_tier` (имена типов; значения — §2.0), enum'ы subscriptions/channels/agent_kind/reaction_kind, `article_section` (legacy pipeline-internal), тип Hook, `uploads_log`, DigestSchedule morning/lunch/evening
- Движок без бренда: `card-status.ts`, `feed-card.tsx`, `stripStructuralLabels`/`cleanPostText`, CALLOUT_LABEL, языковой гейт `russianRatio<0.2` (жёсткое правило «только русский»), `ingest-rss.ts`, `post-channel.ts`, `telegram.ts`, `vk.ts`, `ops-alert.ts`, `paywall.ts`, PostHog-код и `/ingest`-прокси, `deploy.sh` (всё параметризовано env), одноразовые ops-скрипты `scripts/*.mts`
- Архив НЕ трогать: `docs/X10-RESTORE.md`, `docs/SECURITY-AUDIT.md`, `docs/handoffs/`, `docs/strategy/`, `docs/research/` (ссылки на них из нового CLAUDE.md/README — убрать), исторические миграции `drizzle/0000-0011`

---

## 3. Рекомендуемый порядок работ

**Ф0. Пауза + сбор решений.** Сразу: пауза X10-постинга (`/posting` → `posting_control.paused=true`). Затем зафиксировать Р1–Р10 + второстепенные развилки. Блокирует всё остальное.

**Ф1. Бренд-строки, токены, метаданные** (нужны Р1–Р3; независимо от структурных решений). theme.css + fonts.ts ×2, favicon/og с нуля, layout metadata, лого TopBar/sidebar, «Х10 Новости», «X10 Admin» ×11, «редакции Х10 Daily» ×9 промптов (только имя), hero-тексты, моки, package.json description, README (репо публичный — рано).

**Ф2. Рубрикатор + разделы + миграция БД** (нужны Р4, Р5, Р8-флагман). Сквозная правка §2.0 одной пачкой + hand-written миграция 0012+ (`article_category` + `event_type` + судьба `klamps` + `rybakov_take`; **`db:generate` НЕЛЬЗЯ** — правило проекта), bottom-nav, /taxes, /video (+env для channel_id, ⚠️ readBindingsFromEnv), /community (⚠️ MOCK_STATS-фоллбэк в проде), /profile, admin-разделы, цепочка флагман/daily-take. Тесты §2.7 — синхронно, одними коммитами.

**Ф3. Промпты/ToV + источники + канал/бот** (нужны Р1, Р6, Р7, Р8). Перегенерация voice/*.md и BLACKLIST, контекст+теги IngestAgent, CHANNEL_RULES/hookgen/newsletter-CTA, «Читать в Х10» + тест. Источники: seed-sources.sql + прод-`sources` + **обязательный прайминг seen_items** (анти-флуд). Бот/канал: env-значения, бот админом канала, setChatMenuButton, login_domain, tg-login-widget env.

**Ф4. Чистка прод-данных** (нужны Р7, Р10; постинг уже на паузе с Ф0). Порядок §2.6: articles (каскад) → digests → ingest_items → events/authors → users по решению → seed.ts перегенерён. Дамп X10 снят — операции восстановимы.

**Ф5. Домен, деплой, финальные проверки** (нужна Р2). Фолбэки compose/Caddyfile + ACME-email, .env.example, DNS A-записи, домен в Timeweb UI (+SSL), .env.production (домен/бот/канал/PostHog-ключ) → `./deploy.sh`. Смоук: вход в miniapp через menu button (auth-цепочка!), `scripts/post-one-now.mts` в новый канал, `pnpm test` + e2e, снятие паузы постинга. Последним — CLAUDE.md (когда все решения зафиксированы, чтобы новые сессии Claude Code не уезжали в X10-контекст).
