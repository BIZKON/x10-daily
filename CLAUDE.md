# ProAgent AI — Claude Code Context

Это **первый файл**, который Claude Code читает в этом репозитории.
Здесь — суть проекта, стек, архитектурные решения, рабочие правила.

---

## 1. Проект в одном абзаце

**ProAgent AI** («ИИ работает на вас») — ежедневное мини-апп-медиа об ИИ-агентах для ИП и малого/среднего бизнеса РФ: кейсы, методики и новости внедрения — без хайпа, с цифрами выгоды (часы, деньги, конверсия). Продукт живёт внутри Telegram: Mini App (лента + читалка) и канал «ИИ работает на вас!» с форматированными постами слотами 4/день. Авто-контент пишет AI-конвейер (Smart Brevity, HumanGate обязателен), кейсы и обучение редакция добавляет вручную. Медиа — витрина услуги: персональная разработка и внедрение ИИ-агентов под задачи компании (лид-CTA «Обсудить внедрение ИИ-агентов» → @Sekretar_Syrov_IP_bot).

**Главная отстройка:** практическая выгода вместо хайпа. Двойной фильтр: анти-инфобиз (никаких «марафонов успеха») + анти-ИИ-хайп (никаких «революционный ИИ», «магия нейросетей»). Каждая публикация отвечает на вопрос «что это даёт бизнесу в часах/деньгах/конверсии».

**История:** движок построен для X10 Daily (законсервирован 19.07.2026: тег `x10-daily-final`, ветка `x10-legacy`, рунбок `docs/X10-RESTORE.md`). Ребрендинг зафиксирован в `docs/REBRAND-MAP.md` («✅ Решения Константина»).

---

## 2. Стек (фактический, prod на Timeweb Cloud)

| Слой | Технология | Заметки |
|---|---|---|
| **Rendering** | Next.js 16 + Cache Components (`'use cache'`) + PPR | static shell + streamed dynamic holes; см. PPR-граблю в §8 |
| **API** | Hono v4 на Node (Docker-контейнер) | REST; auth по Telegram initData (HMAC) + JWT в HttpOnly cookie |
| **БД** | Managed PostgreSQL Timeweb (Москва) + Drizzle ORM | расширение `vector` включить ДО первого migrate; миграции ТОЛЬКО hand-written |
| **Workflow** | Self-hosted Inngest (docker compose) | ingest-rss → process-source-item → draft-article → drain-post-slots и др. |
| **Клиент** | Telegram Mini App (Web App menu button через Bot API `setChatMenuButton`) | НЕ BotFather; auth+постинг+алерты на одном `TELEGRAM_BOT_TOKEN` |
| **LLM** | Timeweb AI Gateway (OpenAI-совместимый, `api.timeweb.ai/v1`) | воркеры на `deepseek-v4-flash`; модели переключаются env `MODEL_OPUS/SONNET/HAIKU`; Claude выключен |
| **Постинг** | Telegram Bot API (HTML parse_mode, Слой-1 rich) | слоты 09:30·12:30·15:30·18:30 МСК; api.telegram.org только по IPv6 (§8) |
| **Reverse-proxy** | Caddy (auto-TLS, `caddy/Caddyfile.prod`) | домены `app./api./admin.<X10_BASE_DOMAIN>`; прод-домен `pro-agent-ai.ru` |
| **Analytics** | PostHog (EU region, `/ingest` reverse-proxy) | запушен, активация — отдельным решением |
| **Деплой** | одна VM Timeweb + `docker-compose.prod.yml` | ЕДИНСТВЕННЫЙ способ: `./deploy.sh` (или `docker compose --env-file .env.production`) |

**Метрологические бюджеты (обязательны для каждого PR):**
- LCP ≤ 2.5 с (Mobile 4G), INP ≤ 200 мс, CLS ≤ 0.1
- TTFB ≤ 200 мс на edge, TTFT (LLM) ≤ 500 мс
- Локальная мутация ≤ 16 мс (один кадр)
- Bundle JS (initial) ≤ 200 KB gzipped на маршрут

---

## 3. Структура монорепо

```
x10-daily/                  ← техническое имя репо (историческое, не переименовывается)
├── apps/
│   ├── miniapp/          ← Next.js 16 (PPR), Telegram Mini App: лента, читалка, профиль
│   ├── api/              ← Hono v4 на Node: REST + auth (initData HMAC → JWT cookie)
│   ├── admin/            ← Next.js 16, админка: очередь HumanGate, выпуски, конвейер, постинг
│   └── workers/
│       ├── ingest/       ← RSS-парсинг источников (дедуп через seen_items)
│       ├── pipeline/     ← Inngest-функции: draft → numbers/factcheck → tov → brevity → постинг
│       └── newsletter/   ← сборка выпусков (NewsletterAssembleAgent)
├── packages/
│   ├── ui/               ← дизайн-токены (theme.css — единственный источник палитры) + компоненты
│   ├── db/               ← Drizzle ORM: схемы + hand-written миграции + журнал (`drizzle/meta/_journal.json`)
│   ├── config/           ← env-валидация (Zod), shared-константы (шаблоны, лимиты)
│   ├── voice/            ← голос редакции: voice.md, about-me.md, about-author-founder.md, BLACKLIST
│   └── agents/           ← обёртки AI-агентов конвейера (define-agent + 12 агентов)
├── caddy/                ← Caddyfile.prod
├── scripts/              ← seed.ts, seed-sources.sql, ops-скрипты; scripts/infra — IPv6-watchdog
├── .claude/              ← skills, commands, settings (graphify-хуки)
└── docs/                 ← REBRAND-MAP.md, X10-RESTORE.md, handoffs/, strategy/ (архив X10)
```

Все workspace-пакеты — префикс `@x10/*` (техимя, НЕ переименовывать), импорт через TS paths.

---

## 4. AI-конвейер контента

Агенты (`packages/agents`) вызываются Inngest-функциями (`apps/workers/pipeline/src/inngest/functions/`):

| Агент | Триггер | Что делает |
|---|---|---|
| IngestAgent | cron ingest-rss | скоринг RSS-items: новости ИИ/автоматизации, применимые для МСБ РФ; reject академичного/гаджетов/хайпа |
| DraftAgent | after ingest | первый драфт в Smart Brevity от нейтральной редакции ProAgent AI; шаблоны card-news / deep-dive / daily-take («Разбор от основателя») / guide |
| NumbersAgent | parallel | извлекает цифры, проверяет источник |
| FactCheckAgent | political topics | cross-source verification, halt-on-disagreement (проверено: работает) |
| ToV-Agent | after Draft+Numbers | применяет voice.md + BLACKLIST (анти-инфобиз + анти-ИИ-хайп, 32 позиции) |
| BrevityAgent | after ToV | сжимает до ≤300 слов / 25-30 сек чтения |
| PreviewScoreAgent | before gate | скоринг для очереди |
| **HumanGate** | после всех | редактор финалит в админке, кнопка Publish — **AI не публикует автономно** |
| HookGenAgent → SocialAmplifyAgent | after publish | хуки + TG-пост (CTA «Читать в ProAgent AI →»), постинг слотами через drain-post-slots |
| NewsletterAssembleAgent | daily | сборка выпуска (интро, топ, «Разбор от основателя» — поле `rybakovTake` легаси API-контракта) |
| ScoreAgent | weekly | engagement → confidence-пороги pipeline_config |

**Жёсткие правила конвейера:**
- **Только русский**: языковой гейт `russianRatio < 0.2` → halt после draft + правило в промпте DraftAgent.
- **HumanGate обязателен** на каждой публикации.
- Несовпавшая категория из модели → `.catch(null)` → `DEFAULT_CATEGORY='news'` (конвейер не падает).
- Новый источник в `sources` → ОБЯЗАТЕЛЬНЫЙ прайминг `seen_items` (иначе первый тик выстрелит backlog'ом) — см. `scripts/seed-sources.sql`.

**Рубрикатор (сквозной enum, дефолт `news`):** `news` Новости ИИ · `cases` Кейсы · `howto` Обучение · `tools` Инструменты · `business` Практика · `founder` От основателя. Старые X10-ключи (taxes/money/practice/power/tech/rybakov) остаются мёртвыми значениями в PG-enum (PG не умеет DROP VALUE) — в коде/UI их нет.

**Разделы miniapp (bottom-nav):** Лента `/` · Кейсы `/cases` · Обучение `/learn` · Я `/profile`.

---

## 5. Дизайн-канон

- **Шрифты:** Manrope 700/800 (заголовки), Inter 400/500/600 (текст), JetBrains Mono (числа)
- **Цвета:** red `#E63946`, gold `#D4A24C`, steel `#1F2937`, surface `#FAFAF7`, border `#E5E2DA`, bg-dark `#0B0B0E`, text-primary `#F2F2F2` — единственный источник: `packages/ui/src/styles/theme.css` (палитра оставлена с X10-эпохи, смена — отдельным этапом при появлении фирстиля; css-классы `x10-*` не переименовываются)
- **Карточки:** `border-radius: 16px` (web)
- **Обложки карточек:** самодостаточные брендовые, **text-only** (иконки рубрик убраны решением П3 s26 — не возвращать без явного решения владельца); рубрики различаются тинт-полосой (TINT в `branded-cover.tsx`)
- **Смысловые блоки-выноски:** ТОЛЬКО сплошной `var(--steel)` фон + белый текст + золотые акценты. **Градиенты в смысловых блоках запрещены** (отвергнуты за читаемость).
- **Иконки:** lucide-react, stroke 1.5px
- **Анимации:** Framer Motion для переходов

---

## 6. Tone of Voice — главные правила

Два регистра (полный канон — `packages/voice/voice.md`, machine-readable, 10 absence-signals):

1. **Авто-контент** — нейтральная редакция ProAgent AI: Smart Brevity, цифры с источниками, угол «выгода для бизнеса».
2. **Ручные кейсы/разборы** — от первого лица основателя (`about-author-founder.md`, подключается через `loadAuthorVoice("founder")`).

**Чёрный список** (`packages/voice/src/index.ts` BLACKLIST, 32 позиции): универсальный анти-инфобиз («беспрецедентный», «прорывной» и др.) + анти-ИИ-хайп («революционный ИИ», «магия нейросетей», «ИИ заменит всех», «уникальная нейросеть»…).

**Smart Brevity на русском** (6 блоков, ≤300 слов, 25-30 сек чтения):
1. **Tease** — заголовок-крючок
2. **Lede** — одна вводящая фраза
3. **Why it matters** — почему важно (всегда жирным)
4. **By the numbers / Between the lines** — расшифровка
5. **The big picture / Yes, but** — контекст и контраргумент
6. **What's next / Go deeper** — линки

**Обязательно:** цифры с источниками; цитаты с атрибуцией кто/где/когда; сильные глаголы (без «является», «осуществляет»); без выдуманных цитат; регалии — не больше двух в шапке.

---

## 7. Compliance — 152-ФЗ

1. **Данные в РФ:** прод-БД — managed PostgreSQL Timeweb (Москва); LLM-вызовы — через Timeweb AI Gateway (РФ-инфраструктура, DeepSeek). Иностранные LLM-API с реальными ПДн — только после PII-маскировки (KikuAI Masker) и/или ZDR-контракта.
2. **PostHog** — EU region, через `/ingest` reverse-proxy (не US).
3. **Double opt-in обязателен** для email-рассылок (когда появятся).
4. Юзеры идентифицируются Telegram-ID; в LLM-промпты ПДн пользователей не попадают (конвейер работает с публичным новостным контентом).

---

## 8. Рабочие правила для Claude Code

### Когда я запрашиваю фичу

1. **Сначала прочитай** `docs/REBRAND-MAP.md` (решения владельца) и связанные доки — там может быть зафиксированное решение.
2. **Если что-то не зафиксировано** — спроси меня, не предполагай. Особенно бизнес-логика, цены, тарифы.
3. **Перед `pnpm install` новых пакетов** — спрашивай. Контроль dependency-graph за мной.
4. **Никаких `useEffect + fetch` в новом коде** — RSC + Suspense / TanStack Query.
5. **Никаких `localStorage` для серверных данных.**
6. **Server Actions — только для мутаций**, не для data-fetching.
7. **Никогда не показывай спиннеры > 1 с** — skeleton / optimistic UI.
8. **Все тексты, комменты, коммиты, UI — только по-русски.**

### Прод-грабли (нарушение = сломанный прод)

- **PPR-грабля:** статичная страница запекает мок-fallback в `next build`. Фикс: `await connection()` ВНУТРИ Suspense-компонента (НЕ page-level) → PPR-дыры, мок не запекается. Паттерн уже в `/`, `/cases`, `/learn`, `/article/[slug]`.
- **Миграции ТОЛЬКО hand-written:** `db:generate` НЕ запускать; новая миграция = SQL-файл в `packages/db/drizzle/` + запись в `meta/_journal.json` вручную. `ADD VALUE` в enum и `SET DEFAULT` новым значением — РАЗНЫМИ файлами (PG запрещает использовать новое enum-значение в транзакции его добавления).
- **Деплой/рестарт ТОЛЬКО** `./deploy.sh` или `docker compose --env-file .env.production` — иначе crash-loop.
- **Новый env-ключ воркера** → добавить в `readBindingsFromEnv` (`apps/workers/pipeline/src/bindings.ts`) + в compose.
- **IPv6 на прод-VM:** api.telegram.org доступен только по IPv6; глобальный адрес — только по DHCPv6. Рестарт systemd-networkd смывает IPv6 → постинг ETIMEDOUT. Самолечение — watchdog `x10-ipv6-ensure.timer` (/2 мин). **`netplan apply` НЕЛЬЗЯ.**
- **Новый id Inngest-функции** → re-sync PUT на pipeline:8787 из контейнера api (НЕ localhost).
- **Смена бота** атомарна: новый `TELEGRAM_BOT_TOKEN` + бот админом канала + `setChatMenuButton` заново + redeploy (auth и постинг на одном токене; юзеры в БД валидны только при том же боте).

### Когда я прошу написать контент

1. **Проверяй voice.md, about-me.md, about-author-founder.md** в `packages/voice/`.
2. **Применяй чёрный список** (анти-инфобиз + анти-ИИ-хайп).
3. **Smart Brevity 6 блоков**, ≤300 слов.
4. **Цифры — с источниками**, цитаты — с атрибуцией; выдуманных цитат не бывает.
5. **Если упоминается реальный человек или цифра — проверь через web_search.**

### Когда правлю PR

1. **Метрологические бюджеты** (§2) — проверка через `pnpm build` + Lighthouse в CI.
2. **Bundle size budget:** initial JS ≤ 200KB gzipped per route.
3. **TypeScript strict + noUncheckedIndexedAccess** — без `any`, без `as Type` без обоснования в комменте.
4. **Тесты:** Vitest для unit (`pnpm -r test`), Playwright для e2e критических путей.

### Skills и команды

В `.claude/skills/` — user-skills проекта, в `.claude/commands/` — slash-команды.

---

## 9. Где что искать

| Хочешь | Открой |
|---|---|
| Решения владельца по ребрендингу | `docs/REBRAND-MAP.md` (шапка «✅ Решения Константина») |
| Восстановление X10 (архив) | `docs/X10-RESTORE.md` |
| Голос редакции + чёрный список | `packages/voice/voice.md`, `packages/voice/src/index.ts` |
| Источники парсинга (список, adapter_type, правила, pending) | `docs/parsing-sources.md` (канон) + `scripts/seed-sources.sql` |
| Dev-фикстуры | `scripts/seed.ts` (id совпадают с `apps/admin/src/lib/mocks.ts`) |
| Деплой prod | `./deploy.sh`, `docker-compose.prod.yml`, `caddy/Caddyfile.prod` |
| Исторические handoffs сессий | `docs/handoffs/` |
| Архив стратегии X10-эпохи | `docs/strategy/` (НЕ канон нового бренда) |
| Старый CF/Neon deploy-гайд | `docs/DEPLOY.md` (архив, не применять) |

---

**Версия CLAUDE.md:** 2.0 · 20 июля 2026 (ребрендинг X10 Daily → ProAgent AI)
**Канон бренда:** ProAgent AI · «ИИ работает на вас» · рубрикатор news/cases/howto/tools/business/founder

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
