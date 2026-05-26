# X10 Daily

Ежедневное деловое мини-апп-медиа на базе сообщества Игоря Рыбакова. Превращение ежемесячной PDF-газеты «Бизнес-Практика» в мобильно-первое медиа с AI-пайплайном на 13 агентов, платной подпиской и ежеквартальной премиум-печатью.

**Главный отстройка:** жёсткий уход от инфобиза. Smart Brevity. Цифры с источниками. Без выдуманных цитат.

> Контекст для Claude Code — в [CLAUDE.md](./CLAUDE.md). Этот файл прочитай первым.

---

## Стек 2026

- **Frontend:** Next.js 16 (PPR + Cache Components) + React 19 + Tailwind 4 + shadcn/ui
- **API:** Hono v4 на Cloudflare Workers + tRPC v11
- **БД:** Neon Postgres (Frankfurt) + Hyperdrive + pgvector + Drizzle ORM
- **Sync:** Zero (Rocicorp) для клампских чатов
- **AI:** Claude Opus 4.7 / Sonnet 4.6 / Haiku 4.5 — Anthropic ZDR-контракт обязателен
- **PII:** KikuAI Masker (152-ФЗ compliance)
- **Editor:** Tiptap + Yjs (collaborative)
- **Клиенты:** Telegram Mini App + MAX (VK Platform Bridge) — 90% общего кода
- **Email:** Resend (newsletter daily 06:00 МСК)
- **Voice:** ElevenLabs через свой WS-proxy на Render (обход блокировки в РФ)
- **Hosting:** Vercel (Fluid Compute) + Cloudflare Pages, Yandex Cloud Functions фолбэк

Полная архитектура — в `docs/strategy/X10TechRoadmap.pdf` и `docs/strategy/X10ArchitectureSpec.pdf`.

---

## Структура

```
x10-daily/
├── apps/
│   ├── miniapp/          ← Next.js 16, Telegram + MAX Mini App
│   ├── api/              ← Hono v4 на CF Workers
│   ├── admin/            ← Next.js 16, админка редколлегии
│   └── workers/          ← AI-пайплайн (ingest / pipeline / newsletter)
├── packages/
│   ├── ui/               ← shadcn/ui + дизайн-токены X10
│   ├── db/               ← Drizzle schemas + migrations
│   ├── config/           ← env validation
│   ├── voice/            ← voice.md, about-me.md, about-author-*.md
│   └── agents/           ← Claude Agent SDK обёртки
├── .claude/              ← Claude Code skills + commands
└── docs/                 ← полная серия v1.0 (strategy, ToV, financials, ...)
```

---

## Quick start

```bash
# Зависимости (с pnpm)
pnpm install

# Env
cp .env.example .env.local
# Заполнить: ANTHROPIC_API_KEY, DATABASE_URL, TELEGRAM_BOT_TOKEN, ...

# Dev (все приложения сразу через turbo)
pnpm dev

# Билд + чек бюджетов
pnpm build && pnpm typecheck && pnpm test
```

Подробные инструкции по запуску каждого app — в его собственном README (`apps/*/README.md`).

---

## Команда

- **Owner / Founder:** [имя]
- **Editor-in-chief:** [TBD]
- **AI / Tech lead:** [TBD]
- **Sales / Community:** [TBD]

Подробнее — в `docs/strategy/X10EditorialMigration.pdf`.

---

## Лицензия

Proprietary. Не для публичного распространения.
