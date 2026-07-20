# ProAgent AI

**ИИ работает на вас.** Ежедневное мини-апп-медиа об ИИ-агентах для малого и среднего бизнеса: кейсы, методики и новости внедрения — без хайпа, с цифрами выгоды (часы, деньги, конверсия).

Продукт живёт внутри Telegram: Mini App с лентой и читалкой + канал с форматированными постами. AI-конвейер парсит русскоязычные RSS-источники про ИИ и автоматизацию, пишет заметки в формате Smart Brevity (6 блоков, ≤300 слов), прогоняет их через фактчек и Tone-of-Voice-фильтры и после человеческой финализации (HumanGate — редактор в админке) публикует в ленту и канал слотами 4 раза в день. Кейсы и обучающие материалы редакция добавляет вручную.

Репозиторий — монорепо собственного движка: Next.js-миниапп, Hono-API, админка редколлегии и воркеры конвейера. Всё деплоится на одну VM (Timeweb Cloud, РФ) через docker compose с Caddy (auto-TLS) в роли reverse-proxy; LLM-вызовы идут через OpenAI-совместимый AI-шлюз (модели переключаются env-ключами `MODEL_*`).

> Контекст для Claude Code — в [CLAUDE.md](./CLAUDE.md). Этот файл прочитай первым.

---

## Структура

```
x10-daily/                  ← техническое имя репо (историческое)
├── apps/
│   ├── miniapp/          ← Next.js (PPR), Telegram Mini App: лента, читалка, профиль
│   ├── api/              ← Hono на Node: REST + auth по Telegram initData
│   ├── admin/            ← Next.js, админка: очередь HumanGate, выпуски, конвейер
│   └── workers/
│       ├── ingest/       ← RSS-парсинг источников (дедуп, seen_items)
│       └── pipeline/     ← Inngest-функции: draft → фактчек → ToV → постинг слотами
├── packages/
│   ├── ui/               ← дизайн-токены + общие компоненты
│   ├── db/               ← Drizzle ORM: схемы + hand-written миграции (PostgreSQL)
│   ├── config/           ← env-валидация (Zod), общие константы
│   ├── voice/            ← голос редакции: voice.md, about-me.md, чёрный список
│   └── agents/           ← обёртки AI-агентов конвейера
├── caddy/                ← Caddyfile.prod (reverse-proxy + TLS)
├── scripts/              ← сиды, ops-скрипты, инфра (IPv6-watchdog)
└── docs/                 ← рабочие документы и handoffs
```

Workspace-пакеты — с префиксом `@x10/*` (техимена, не переименовываются).

---

## Quick start (dev)

```bash
# Зависимости
pnpm install

# Env
cp .env.example .env.local
# Заполнить: DATABASE_URL, TELEGRAM_BOT_TOKEN, AI_GATEWAY_API_KEY, ...

# Dev (все приложения через turbo)
pnpm dev

# Проверки
pnpm build && pnpm typecheck && pnpm test
```

---

## Деплой (prod)

Прод — одна VM с `docker-compose.prod.yml` (redis, self-host Inngest, api, pipeline, admin, miniapp, caddy). Единственный поддерживаемый способ деплоя:

```bash
./deploy.sh
```

Скрипт собирает и перезапускает контейнеры с `--env-file .env.production`. Запуск `docker compose` без `--env-file .env.production` приводит к crash-loop из-за отсутствующих env-ключей. Домены `app./api./admin.<домен>` берутся из `X10_BASE_DOMAIN`; TLS выпускает Caddy автоматически.

⚠️ После добавления нового RSS-источника обязателен прайминг `seen_items` (анти-флуд) — см. комментарий в `scripts/seed-sources.sql`.

---

## Лицензия

Proprietary. Не для публичного распространения.
