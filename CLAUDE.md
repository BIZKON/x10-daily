# X10 Daily — Claude Code Context

Это **первый файл**, который Claude Code читает в этом репозитории.
Здесь — суть проекта, стек, архитектурные решения, рабочие правила.

---

## 1. Проект в одном абзаце

**X10 Daily** — ежедневное деловое мини-апп-медиа для русскоязычной аудитории на базе сообщества Игоря Рыбакова (~30 885 кламперов, 6M подписчиков). Превращение ежемесячной PDF-газеты «Бизнес-Практика» в мобильно-первое медиа с AI-пайплайном, платной подпиской и ежеквартальной премиум-печатью как сувениром. Цель Base к Q4 2026: **24K DAU / 700 paid / ~12M ₽ ARR**. Стретч-цель: 80K DAU / 2K paid / 36M ₽ ARR.

**Главная отстройка:** жёсткий уход от инфобиза после кейса Шабутдинова (Like Центр, 7 лет колонии, 31.10.2025). Любая публикация проходит тест «можно ли спутать с Like Центром / БМ / марафонами успеха». Если да — переписываем.

Полные документы серии v1.0 (Strategy, ToV, Финмодель, Rewrites, Tech Roadmap, Competitive Analysis, Editorial Migration) — в `docs/`.

---

## 2. Стек 2026 (зафиксирован в Tech Roadmap v1.0)

| Слой | Технология | Почему |
|---|---|---|
| **Rendering** | Next.js 16 + Cache Components (`'use cache'`, `cacheLife`, `cacheTag`) + PPR | static shell + streamed dynamic holes в одном HTTP-ответе |
| **API** | Hono v4 на Cloudflare Workers | V8 isolates, нет cold start, edge-латентность |
| **Хостинг фолбэк** | Yandex Cloud Functions | для РФ, если CF недоступен из конкретной локации |
| **БД** | Neon Postgres (Frankfurt) + Hyperdrive cache | branching, cold start 300-500 мс, кэш-хит <5 мс |
| **Sync engine** | **Zero (Rocicorp)** | для клампских чатов, локальный кэш + дельты по WS |
| **Vector** | pgvector в Neon | для RAG «Спроси Х10» |
| **Editor** | Tiptap + Yjs | collaborative editing для админки контента |
| **Клиенты** | Telegram Mini App SDK 7.x + MAX через VK Platform Bridge | 90% кода общий |
| **Email** | Resend ($0→$20→$80 по мере роста) | newsletter daily 06:00 МСК |
| **Платежи** | Telegram Stars (digital goods) + ЮKassa (standalone) | TG-требования + РФ-эквайринг |
| **Auth** | Telegram initData + MAX OAuth + email magic link | бесшовно внутри мессенджера |
| **AI ядро** | Claude Sonnet 4.6 ($3/$15) | DraftAgent, ToV-Agent, ScoreAgent |
| **AI фильтр** | Claude Haiku 4.5 ($1/$5) | Numbers, HookGen, дешёвые проходы |
| **AI critical** | Claude Opus 4.7 ($5/$25) | FactCheck в политических темах |
| **Voice** | ElevenLabs через WS-proxy на Render | блокировка ElevenLabs в РФ обходится |
| **PII** | KikuAI Masker (self-hosted) | 152-ФЗ compliance, mask перед LLM, unmask после |
| **Search** | Meilisearch | full-text по русскому |
| **Push** | Telegram Bot API + WebPush + OneSignal | утренний/вечерний дайджест |
| **Analytics** | PostHog (EU region) | воронки, retention, A/B |
| **Errors** | Sentry | sourcemaps + AI summarize |
| **CI/CD** | GitHub Actions + Vercel (Fluid Compute) | preview-deploys на PR |

**Метрологические бюджеты (обязательны для каждого PR):**
- LCP ≤ 2.5 с (Mobile 4G), INP ≤ 200 мс, CLS ≤ 0.1
- TTFB ≤ 200 мс на edge, TTFT (LLM) ≤ 500 мс
- Локальная мутация ≤ 16 мс (один кадр)
- Bundle JS (initial) ≤ 200 KB gzipped на маршрут

---

## 3. Структура монорепо

```
x10-daily/
├── apps/
│   ├── miniapp/          ← Next.js 16, Telegram + MAX Mini App (Тип 3)
│   ├── api/              ← Hono v4 на CF Workers (REST + tRPC v11)
│   ├── admin/            ← Next.js 16, админка редколлегии (Тип 2 SaaS dashboard)
│   └── workers/
│       ├── ingest/       ← парсинг источников 06:00 МСК
│       ├── pipeline/     ← AI-агенты (Draft→Numbers→FactCheck→ToV→Brevity→Audio)
│       └── newsletter/   ← NewsletterAssembleAgent + Resend send
├── packages/
│   ├── ui/               ← shadcn/ui + дизайн-токены (Manrope/Inter/JetBrains Mono, red/gold/steel)
│   ├── db/               ← Drizzle ORM schemas + migrations для Neon
│   ├── config/           ← env validation (Zod), shared constants
│   ├── voice/            ← voice.md, about-me.md, about-author-{name}.md
│   └── agents/           ← Claude Agent SDK обёртки для всех 13 агентов pipeline
├── .claude/
│   ├── skills/           ← user-skills (Х10-специфичные)
│   └── commands/         ← кастомные slash-команды Claude Code
├── docs/
│   ├── strategy/         ← X10Strategy, ToV, Финмодель, Competitive Analysis
│   ├── handoffs/         ← Handoff-документы сессий 1-7
│   └── research/         ← Community research, benchmarks
└── scripts/              ← миграции, сидинг, ops
```

Все workspace-пакеты префикс `@x10/*`, импорт через TS paths.

---

## 4. AI-пайплайн контента (Amplification Layer v2.0)

**13 агентов** запускаются по триггерам через workflow engine (Inngest или Trigger.dev v3 — решение открыто):

| # | Агент | Модель | Триггер | Что делает |
|---|---|---|---|---|
| 01 | IngestAgent | Haiku 4.5 | 06:00 МСК cron | парсит ~200 источников (TASS, Interfax, RBC, Bloomberg) |
| 02 | DraftAgent | Sonnet 4.6 | after ingest | пишет первый драфт в Smart Brevity (Tease/Lede/Why/Numbers/Yes-but/What's-next) |
| 03 | NumbersAgent | Haiku 4.5 | parallel to Draft | извлекает цифры, проверяет источник, форматирует JetBrains Mono |
| 04 | FactCheckAgent | **Opus 4.7** | political topics only | cross-source fact verification, halt-on-disagreement |
| 05 | ToV-Agent | Sonnet 4.6 | after Draft+Numbers | применяет voice.md + about-author-{name}.md + чёрный список ~30 слов |
| 06 | BrevityAgent | Sonnet 4.6 | after ToV | сжимает до ≤300 слов / 25-30 сек чтения |
| 07 | AudioAgent | ElevenLabs (via proxy) | optional | 5-8 мин аудио-версия для подкаста |
| 08 | HumanGate | — | после всех 1-7 | редактор финалит, кнопка Publish |
| 09 | HookGenAgent | Haiku 4.5 | after Brevity | 6 паттернов хуков (number-led/contrarian/transformation/authority/admission/future-shock) |
| 10 | SocialAmplifyAgent | Sonnet 4.6 | after HookGen | конвертирует в TG-Рыбакова / Дзен / VK / LinkedIn (свой voice на канал) |
| 11 | VisualAgent | Gemini 2.5 Flash (proxy) | feature flag | инфографика для viral-friendly publications |
| 12 | ScoreAgent | Sonnet 4.6 | weekly | парсит engagement → обновляет confidence-пороги pipeline_config |
| 13 | NewsletterAssembleAgent | Sonnet 4.6 | 06:00 МСК daily | собирает выпуск из 7 секций, A/B subject через HookGen |

**Себестоимость pipeline:** ~$0.45 за статью (~42 ₽). 110 статей/мес = $50/мес.
**Полный AI-бюджет:** $183/мес с amplification + visual. **Включая инфру: $383/мес.**

Архитектурное правило: **HumanGate обязателен** на каждой публикации. AI не публикует автономно.

---

## 5. Дизайн-канон (зафиксирован в трёх сессиях правок)

- **Формат печати/PDF:** A4, padding 13mm × 16mm
- **Шрифты:** Manrope 700/800 (заголовки), Inter 400/500/600 (текст), JetBrains Mono (числа)
- **Цвета:** red `#E63946`, gold `#D4A24C`, steel `#1F2937`, surface `#FAFAF7`, border `#E5E2DA`, bg-dark `#0B0B0E`, text-primary `#F2F2F2`
- **Карточки:** `border-radius: 6px` (печать), `16px` (web)
- **Смысловые блоки-выноски:** ТОЛЬКО сплошной `var(--steel)` фон + белый текст + золотые акценты на `<b>`. **Градиенты в смысловых блоках запрещены** — отвергнуты пользователем за читаемость в правой части.
- **Иконки:** lucide-react, stroke 1.5px (совпадает с Manrope)
- **Анимации:** Framer Motion для слайдов дайджеста и переходов между табами

---

## 6. Tone of Voice — главные правила

**Чёрный список** (никогда не использовать, замены — в `docs/strategy/X10ToVGuidelines.pdf`):
«соборное мышление», «архитектор возможностей», «преображать мир», «миллион сердец», «созидательная энергия», «проявленность», «истинный путь», «коллективная воля», и ещё ~22 термина.

**Smart Brevity на русском** (6 блоков, ≤ 300 слов, 25-30 сек чтения):
1. **Tease** — заголовок-крючок
2. **Lede** — одна вводящая фраза
3. **Why it matters** — почему важно (всегда жирным)
4. **By the numbers / Between the lines / What they're saying** — расшифровка
5. **The big picture / Yes, but** — контекст и контраргумент
6. **What's next / Go deeper** — линки

**Обязательно:**
- Цифры с источниками
- Цитаты с атрибуцией кто/где/когда
- Глаголы сильные, без «является», «осуществляет»
- Регалии — не больше двух в шапке
- Без выдуманных цитат (см. кейс Романчук — Баффет, главный аргумент для редколлегии)

`packages/voice/voice.md` — machine-readable формат с 10 absence-signals для AI-агентов.

---

## 7. Compliance — 152-ФЗ

**Критично до первого вызова LLM в продакшене:**

1. **Anthropic ZDR-контракт** должен быть подписан до первого API-вызова с реальными ПДн — иначе input/output логируются 30 дней (нарушение 152-ФЗ, штраф ₽75K-700K).
2. **KikuAI Masker** разворачивается на Render.com / self-hosted Docker, между приложением и Anthropic/ElevenLabs. Паттерн: mask → LLM call → unmask на ответе. Session caching для мультитурновых диалогов.
3. **PostHog** — EU region (`https://eu.posthog.com`), не US.
4. **Neon** — Frankfurt regiono для соответствия GDPR/152-ФЗ по локализации.
5. **Double opt-in обязательный** для email-newsletter (Resend).
6. **Privacy policy + согласия** — в `docs/strategy/` (нужно ещё подготовить, см. Roadmap B3).

---

## 8. Рабочие правила для Claude Code

### Когда я запрашиваю фичу

1. **Сначала прочитай связанные документы** в `docs/strategy/` — там может быть зафиксированное решение.
2. **Если что-то не зафиксировано** — спроси меня, не предполагай. Особенно для бизнес-логики, цен, тарифов.
3. **Перед `pnpm install` любых новых пакетов** — спрашивай. Я хочу контроль над dependency-graph.
4. **Никаких `useEffect + fetch` в новом коде** — RSC + Suspense / TanStack Query / Zero. Это в антипаттернах стека 2026.
5. **Никаких `localStorage` для серверных данных** — IndexedDB/Dexie через Zero.
6. **Server Actions — только для мутаций**, не для data-fetching.
7. **Никогда не показывай спиннеры > 1 с** — skeleton / optimistic UI. См. правило бюджета на скелетоны в Tech Roadmap.

### Когда я прошу написать контент

1. **Проверяй voice.md и about-me.md в `packages/voice/`.**
2. **Применяй чёрный список (см. секцию 6).**
3. **Smart Brevity 6 блоков**, не больше 300 слов на статью.
4. **Цифры — с источниками**, цитаты — с атрибуцией.
5. **Если упоминается реальный человек или цифра — проверь через web_search** перед записью.

### Когда правлю PR

1. **Метрологические бюджеты** (секция 2) — обязательная проверка через `pnpm build` + Lighthouse в CI.
2. **Bundle size budget:** initial JS ≤ 200KB gzipped per route.
3. **TypeScript strict + noUncheckedIndexedAccess** — без `any`, без `as Type` без обоснования в комменте.
4. **Тесты:** Vitest для unit, Playwright для e2e критических путей (auth, paywall, publish).

### Skills и команды

В `.claude/skills/` лежат user-skills для этого проекта. В `.claude/commands/` — кастомные slash-команды.

Установить дополнительные скиллы из проекта Claude.ai (если уже есть собранные):

```bash
# В Claude Code
/skill install ~/Downloads/x10-skills.zip
```

---

## 9. Где что искать

| Хочешь | Открой |
|---|---|
| Полная стратегия и unit-economics | `docs/strategy/X10Strategy.pdf` |
| Чёрный/белый список ToV | `docs/strategy/X10ToVGuidelines.pdf` |
| 12-месячная финмодель | `docs/strategy/X10-Finmodel-12mo.xlsx` |
| Tech Roadmap M0→M12 | `docs/strategy/X10TechRoadmap.pdf` |
| Конкурентная матрица 6×7 | `docs/strategy/X10CompetitiveAnalysis.pdf` |
| План миграции редколлегии | `docs/strategy/X10EditorialMigration.pdf` |
| Архитектурная схема v2.0 | `docs/strategy/X10ArchitectureSpec.pdf` |
| AI-пайплайн (13 агентов) | `docs/strategy/X10AmplificationLayer.pdf` |
| Newsletter foundation | `docs/strategy/X10NewsletterFoundation.pdf` |
| Editorial toolkit для авторов | `docs/strategy/X10EditorialToolkit.pdf` |
| Все исторические handoffs | `docs/handoffs/` |
| React-прототип 5 экранов | `docs/research/X10-Prototype.tsx` |
| Community research | `docs/research/X10-Research.md` |

---

## 10. Первая задача после bootstrap

Когда ты только что прочитал этот файл, твоя первая команда от меня скорее всего будет:

> «Инициализируй apps/miniapp как Next.js 16 с PPR, apps/api как Hono v4 на Cloudflare Workers, packages/db с Drizzle под Neon, packages/ui с shadcn/ui base. Используй стек из CLAUDE.md. Покажи план перед выполнением.»

Реагируй: покажи план (структура файлов, зависимости которые поставишь, какие команды запустишь), дождись моего «ок», потом действуй.

---

**Версия CLAUDE.md:** 1.0 · 26 мая 2026
**Серия документов v1.0:** закрыта (10 артефактов, ~110 стр PDF + Excel + TSX)
**Следующая фаза:** пилот M0 — июнь 2026
