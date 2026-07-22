# Источники парсинга ProAgent AI

Канонический список источников автономного ingest-пайплайна и правила их получения.
Ниша: **ИИ-разработка и агентная работа для бизнеса** (доступная кастомная разработка
силами ИИ-агентов/сотрудников) — англоязычные эксперты и опенсорс + RU-фон.

Материалы: fetch → дедуп (`seen_items`, exact-id по `source_id+external_id`; SimHash
считается и пишется в `fingerprint`, но для дедупа пока не используется) → IngestAgent-гейт
→ рерайт на русский → HumanGate → публикация. **Этот док — только про источники.**

## Модель источника (таблица `sources`, миграция 0013)

| Поле | Значение |
|---|---|
| `kind` | операционный тип для крона. Всё, что фетчится (rss/atom/youtube/github/reddit) = `rss` |
| `adapter_type` | семантика: `rss` / `youtube` / `github` / `reddit` / `x` |
| `status` | `active` / `inactive` (архив) / `pending` (ждёт моста/резолва) |
| `enabled` | крон фетчит `kind='rss' AND enabled=true`. **pending всегда `enabled=false`** |
| `tier` | `primary` / `secondary` / `fringe` — приоритет/скоринг |
| `locale` | `ru` / `en` (информационно; en-источники переводятся DraftAgent'ом) |

Фетчер [apps/workers/ingest/src/fetch-rss.ts](../apps/workers/ingest/src/fetch-rss.ts)
(`rss-parser`) **универсален — парсит RSS и Atom**, поэтому YouTube `videos.xml`,
GitHub `releases.atom`, Reddit `.rss` фетчатся тем же кодом как `kind='rss'`.
User-Agent уже задан: `ProAgentAI-ingest/0.1 (+https://pro-agent-ai.ru)`.

## Правила по адаптерам

- **`rss`** (блоги/рассылки/RU-ленты): прямой фид. Путь ищется автодискавери
  (`<link rel="alternate" type="application/rss+xml">`) или типовыми путями
  (`/rss`, `/feed`, `/rss.xml`…). Не найден → `pending` + пометка.
- **`youtube`**: URL = `https://www.youtube.com/feeds/videos.xml?channel_id=UC…`.
  `channel_id` резолвится из хэндла (canonical/`channelId` в HTML канала) — **не выдумывать**.
  Фид даёт заголовок+ссылку (описание в `media:group` rss-parser по умолчанию не тянет;
  транскрипт — downstream, вне этой задачи). Не резолвится → `pending`.
- **`github`**: URL = `https://github.com/OWNER/REPO/releases.atom`. Релизы как «новости».
- **`reddit`**: `https://www.reddit.com/r/NAME/top/.rss?t=week` (top-week = выше сигнал/шум).
  ⚠️ **Требует кастомный UA** (стоит) — но Reddit **429-ит datacenter-IP** (проверено с
  прод-VM: первый запрос 200, дальше 429; `old.reddit` — 200 но обрезанный ответ). Все
  Reddit-источники сейчас **`pending`**: нужен OAuth-API (60/мин) или RSS-мост.
- **`x`** (Twitter): нативного RSS **нет**. Всегда `pending`+disabled. Нужен
  RSS.app / self-hosted Nitter-мост — отдельной задачей. Эндпоинты не выдумывать.

**Прайминг** (анти-флуд): новый active-источник примирается (текущий фид → `seen_items`),
иначе первый тик ingest выстрелит бэклогом. Делает [scripts/verify-sources.mts](../scripts/verify-sources.mts)
(он же — реальный fetch-прогон приёмки). Форс-бэкфилл источника: удалить его строки из
`seen_items` → следующий тик подхватит бэклог.

## Активные источники

### RU-фон (общие ИИ-новости)
| Источник | adapter | tier | фид |
|---|---|---|---|
| Habr · Искусственный интеллект | rss | primary | habr.com/ru/rss/hub/artificial_intelligence |
| RB.RU · тег ИИ | rss | primary | rb.ru/feeds/tag/ai |
| Habr · Машинное обучение | rss | secondary | habr.com/ru/rss/hub/machine_learning |
| vc.ru | rss | secondary | vc.ru/rss |
| RB.RU (общая) | rss | fringe | rb.ru/feeds/all |
| Хайтек | rss | fringe | hightech.fm/feed |

### Блок 1 — бизнес-модель (ИИ-услуги/сотрудники для SMB)
| Источник | adapter | tier | формат |
|---|---|---|---|
| Nick Saraev · YouTube | youtube | primary | видео |
| Nick Saraev · рассылка (nicksaraev.com/rss) | rss | secondary | текст |
| Nate Herk · YouTube | youtube | primary | видео |
| Liam Ottley · YouTube | youtube | secondary | видео |
| Mark Kashef · YouTube | youtube | secondary | видео |
| Brendan Jowett · YouTube | youtube | fringe | видео |
| Jannis Moore · YouTube | youtube | fringe | видео |

### Блок 2 — инженерная практика (как строят софт агентами)
| Источник | adapter | tier | формат |
|---|---|---|---|
| Dave Ebbelaar · YouTube | youtube | primary | видео |
| IndyDevDan · YouTube | youtube | primary | видео |
| Cole Medin · YouTube | youtube | primary | видео |
| Cole Medin · Archon (GitHub releases) | github | secondary | код |
| AI Jason · YouTube | youtube | secondary | видео |
| Riley Brown · YouTube | youtube | secondary | видео |

### Блок 3 — стратегия/текст
| Источник | adapter | tier | формат |
|---|---|---|---|
| Matthew Berman · YouTube | youtube | primary | видео |
| Greg Isenberg · YouTube | youtube | secondary | видео |

### Блок 4 — опенсорс-фреймворки (GitHub releases)
CrewAI (primary) · n8n (primary) · Dify (secondary) · Activepieces (secondary) ·
CopilotKit (fringe) · PraisonAI (fringe). Фиды: `github.com/OWNER/REPO/releases.atom`.

## Pending (enabled=false — не в прогоне, ждут отдельной задачи)

| Источник | adapter | причина |
|---|---|---|
| r/AI_Agents, r/n8n, r/AgentsOfAI, r/SaaS | reddit | 429 на datacenter-IP → нужен OAuth-API или RSS-мост |
| Greg Isenberg · X (@gregisenberg) | x | нет нативного RSS → нужен RSS.app / Nitter-мост |
| Dave Ebbelaar · блог (daveebbelaar.com) | rss | RSS-фид не найден автодискавери (YouTube автора активен) |
| IndyDevDan · блог (indydevdan.com) | rss | RSS-фид не найден автодискавери (YouTube автора активен) |
| Matthew Berman · Forward Future (forwardfuture.com) | rss | RSS не найден (возможно Beehiiv — уточнить домен forwardfuture.ai/pub-id) |

## Добавить/поменять источник
Data-driven, без деплоя кода: правка [scripts/seed-sources.sql](../scripts/seed-sources.sql)
(идемпотентен по `name+url`) → `psql "$DATABASE_URL" -f scripts/seed-sources.sql` → прогнать
`verify-sources.mts` (проверка + прайминг). Точечно: `UPDATE sources SET enabled=…, status=…`.
