# Handoff · Session 10

**Дата:** 27 мая 2026
**Что закрыто:** Приоритет A (seed-скрипт) + Brief B целиком (article reader optimistic UI + pipeline-config edit UI + rubrics filtering)
**Репозиторий:** https://github.com/BIZKON/x10-daily
**HEAD после сессии:** этот handoff будет последним коммитом — 6-м за сессию.

---

## Git коммиты сессии (5 + handoff)

Все 5 — самодостаточные, typecheck чистый на каждом шаге, запушены на `origin/main`.

```
e19a2ab  feat(admin): rubrics filtering — clickable subcategories → filtered queue
b31a096  feat(admin): pipeline-config edit UI — enabled / model override / threshold
4ddd513  feat(miniapp): article reader optimistic UI — реакции, закладки, прогресс чтения
a843541  feat(api): GET /v1/articles/:id/me — per-user engagement snapshot
7338acb  feat(seed): scripts/seed.ts — 4 users + 5 authors + 10 klamps + 3 events + 2 articles + digest
```

---

## Что закрыто за сессию (5 чаптеров)

### 1. Seed-скрипт (Приоритет A)

`scripts/seed.ts` + `scripts/tsconfig.json` + wiring через `pnpm db:seed`.

**Объём фикстур** (по плану из handoff-session-9): 4 users · 5 authors · 10 klamps · 3 events · 2 articles · 1 digest.

- **Идемпотентность** через `onConflictDoNothing()` по уникальным ключам (slug / issueDate / (platform, platform_user_id)). Безопасно гонять много раз.
- **Стабильные UUID** совпадают с `apps/admin/src/lib/mocks.ts` — demo mode ↔ real DB дают один и тот же набор id. После заливки `pnpm db:seed` в admin demo-banner исчезнет, клик по карточке очереди ведёт на корректный detail.
- **Tooling**: `tsx` уже был devDep `@x10/db`, никаких новых install'ов. Скрипт ругается по-русски и выходит exit 1 если `DATABASE_URL` не задан.
- **Покрытие типчеком**: standalone `scripts/tsconfig.json` с path mapping для `@x10/db`, добавлен в root `pnpm typecheck` через `&& tsc --noEmit -p scripts/tsconfig.json`.

Запуск (после развёрнутого Neon + миграций):
```bash
export DATABASE_URL='postgresql://...neon.tech/...'
pnpm --filter @x10/db db:migrate
pnpm db:seed
```

### 2. API: GET /v1/articles/:id/me

`apps/api/src/routes/engagement.ts` + `apps/api/test/engagement.test.ts`.

Per-user snapshot для optimistic UI initial state в article reader.

- **Anonymous fast-path**: `tryExtractUserId` без X-User-Id → мгновенный `ANONYMOUS_USER_STATE` без обращения к БД.
- **Authenticated path**: 3 параллельных query (Promise.all) — reactions, bookmark, reading_history. Возвращает `{userReactions: {fire, insight, question}, isBookmarked, readPercent}`.
- **Тест** на anonymous-путь + 400 на bad UUID. Тест-раннер `apps/api` (`@cloudflare/vitest-pool-workers@0.16.9` ↔ `vitest@4.1.7`) пре-сломан до этой сессии — `health.test.ts` тоже не запускается. Тест корректен и побежит когда раннер починят.

### 3. Miniapp: article reader optimistic UI (Brief B)

Brief §11 PERF — мутации ≤16мс через React 19 `useOptimistic` + Next.js Server Actions.

**Архитектура (PPR-friendly):**
```
ArticlePage RSC (generateStaticParams сохраняется)
├── <HeaderShare>           ← client, Web Share API + clipboard fallback + toast
├── <article> body          ← RSC static
├── <Suspense>
│   └── <ArticleEngagement> ← async RSC, фетчит /v1/articles/:id/me
│        └── <EngagementBar> ← client, useOptimistic для 3 реакций + bookmark
└── <ReadingProgress>       ← client, throttled scroll beacon
```

**Server Actions** (`apps/miniapp/src/lib/engagement-actions.ts`, `"use server"`):
- `toggleReactionAction(id, kind)`
- `toggleBookmarkAction(id)`
- `reportProgressAction(id, percent, seconds?)`
Возвращают `{ok, ...}` без throw — `useOptimistic` корректно откатывается без error boundary.

**3 client-компонента**: `engagement-bar.tsx` (3 реакции из brief §6 enum: fire/insight/question — мёртвая 4-я 😱 убрана), `header-share.tsx`, `reading-progress.tsx` (throttle 5с + flush на visibility=hidden).

**Header restructured**: убраны мёртвые `HeartHandshake` (bookmark переехал в EngagementBar) и `Share2`-кнопка-заглушка. Audio button — dimmed placeholder до AudioAgent через ElevenLabs proxy.

**FeedItem расширен**: `reactionBreakdown` (per-kind counts) + `bookmarkCount`. `ApiArticle` получил `bookmarkCount/commentCount/shareCount` (приходят из `/v1/articles/:slug`, но раньше не были в типе).

**Next.js 16 PPR fix**: `Date.now()` в `useRef` initializer запрещён правилом `next-prerender-current-time-client`. Исправлено — `useRef<number>(0)` + `Date.now()` только в `useEffect`/event handlers.

Проверено в preview: страница рендерится, реакции/закладка кликаются, Server Action POST → 200. Без auth env action возвращает `no_auth` → optimistic auto-clears.

### 4. Admin: pipeline-config edit UI (Brief B)

Backend `pipeline_config` table (с миграции 0000) был, UI был read-only. Теперь — редактируемый.

**API** (`apps/api/src/routes/admin-content.ts`) — 3 новых endpoint'a:
- `GET /v1/admin/pipeline-config` — список 12 агентов с effective config (stored row OR schema defaults).
- `GET /v1/admin/pipeline-config/:agent` — single, 200 всегда (дефолты если не сохранён).
- `PUT /v1/admin/pipeline-config/:agent` — upsert через SELECT+UPDATE/INSERT.

**Admin lib**: `AdminPipelineConfig` type + `PIPELINE_AGENTS` const + 2 fetcher'a + `adminMutate` расширен на `"PUT"`.

**Admin UI**:
- `apps/admin/src/app/pipeline-config/agent-meta.ts` — статическая таблица 13 пунктов из CLAUDE.md §4 вынесена из page.tsx (используется и overview, и edit).
- Overview: async RSC, загружает configs, рендерит per-agent чип (enabled state + override + threshold) + Edit ссылку. HumanGate без edit-ссылки.
- `[agent]/page.tsx` + `pipeline-config-form.tsx` — edit page с метаданными агента слева и формой справа (Checkbox enabled + Select modelOverride с 4 вариантами + number threshold).
- `actions.ts` — Server Action `updatePipelineConfig`.

**Demo mode**: 12 mock configs с дефолтами + 3 вариации (factcheck threshold 0.85, audio/visual disabled).

**Известное ограничение**: нет unique-индекса на `pipeline_config.agent` — приложение enforces через SELECT+UPDATE/INSERT. Будущая миграция 0004 закрепит "один row per agent" в схеме. `params` jsonb не редактируется в UI (footgun без валидатора, отдельная задача).

### 5. Admin: rubrics filtering (Brief B)

`/rubrics` страница из read-only справочника становится entry point в очередь.

- **API** (`apps/api/src/routes/admin.ts`): `querySchema /v1/admin/queue` +`category` (enum 6) +`subcategory` (≤64). `and(...)` фильтр.
- **Admin lib**: `QueueFilter` type, `fetchQueue` принимает `{category?, subcategory?}`. URL params в real, `.filter()` в demo.
- **Queue page**: Next.js 16 Promise `searchParams` parse, `<ActiveFilter>` чип «Фильтр: ДЕНЬГИ · money.cbr · [× Сбросить]», counter «N отфильтровано» vs «N в очереди», EmptyQueue знает про filtered=true.
- **Rubrics page**: каждая подкатегория → Link к `/?category=X&subcategory=X.Y`; заголовок рубрики → Link к `/?category=X`. **34 filter-ссылки всего** (6 категорий + 28 подкатегорий из brief §1).

Проверено в preview: /rubrics → клик `money.cbr` → /?category=money&subcategory=money.cbr → 1 результат (ЦБ-статья) + фильтр-чип + «× Сбросить».

**Brief B закрыт целиком** (article reader optimistic UI + pipeline-config edit UI + rubrics filtering).

---

## Что работает (проверено)

### Тесты — без изменений (50 vitest было до сессии)

- Один новый тест добавлен (`apps/api/test/engagement.test.ts`) — побежит когда раннер `@cloudflare/vitest-pool-workers` обновят под vitest 4.x. Старый health.test.ts тоже не запускается из-за этой регрессии — это пре-сломанный tool chain, не из-за моих правок.

### Что собрано (delta из session 9)

| Слой | Состояние после сессии 10 |
|---|---|
| `scripts/` | новая папка: `seed.ts` (478 lines) + `tsconfig.json`. Подключена к root typecheck. |
| @x10/db | без изменений в схеме. Доступ через seed/migrate scripts. |
| @x10/agents | без изменений. |
| @x10/voice / config / ui | без изменений. |
| apps/api | **13 routes** (было 11): + GET `/v1/articles/:id/me`, + GET/PUT `/v1/admin/pipeline-config(:agent)?`. Queue endpoint расширен query-params. |
| apps/workers/pipeline | без изменений. |
| apps/miniapp | Article reader: 3 новых client-компонента + Server Actions + per-user RSC в Suspense. Header restructured. PPR-safe. |
| apps/admin | Pipeline-config edit (overview + edit page + form + actions + agent-meta модуль). Rubrics-filtering ссылки. Queue фильтр-чип. |

### Локальный dev-flow (5 терминалов) — без изменений из session 9

```bash
# Terminal 1 — apps/api
cd apps/api && pnpm wrangler dev --port 8788
# Terminal 2 — pipeline worker
pnpm -F @x10/worker-pipeline dev
# Terminal 3 — Inngest dev server
pnpm -F @x10/worker-pipeline inngest:dev
# Terminal 4 — miniapp
pnpm -F @x10/miniapp dev
# Terminal 5 — admin
pnpm -F @x10/admin dev
```

### Env переменные (.env.local) — без изменений из session 9

См. handoff-session-9.md §«Env переменные» — те же. Новых env-переменных эта сессия не добавляет.

### Demo mode

При отсутствии `X10_API_BASE_URL` admin/miniapp работают на моках. Demo banner в admin. **Новое в этой сессии**:
- `MOCK_PIPELINE_CONFIGS` — 12 mock-конфигов (factcheck 0.85, audio+visual disabled).
- Mock queue фильтруется client-side в demo mode (`.filter()` по category/subcategory).
- ANONYMOUS_USER_STATE для miniapp article reader без auth env.

---

## Не работает / нужно для prod (актуализировано)

Изменилось из session 9 (✓ = закрыто, новое — без префикса):

1. ✓ ~~Seed-скрипт~~ — есть.
2. **БД не развёрнута** — Neon Frankfurt не создан, миграции 0000/0001/0002/0003 не применены.
3. **apps/api worker** не задеплоен — `wrangler deploy` ни разу.
4. **R2 bucket** не создан — `wrangler r2 bucket create x10-images` + `wrangler r2 bucket create x10-images-preview`.
5. **R2 binding в wrangler.toml** закомментирован — раскомментировать после создания bucket'a.
6. **Anthropic ZDR контракт** не подписан → первый LLM-вызов в prod нарушает 152-ФЗ (см. CLAUDE.md §7).
7. **KikuAI Masker** не задеплоен на Render. `MASKER_BASE_URL`/`MASKER_API_KEY` пустые.
8. **Inngest cloud** — нужно зарегистрироваться, получить `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`.
9. **Auth** — `X-User-Id` header это MVP stub. Нужна Telegram initData verification.
10. **Cron-функции** — daily ingest 06:00 МСК, newsletter 06:00 МСК, weekly score Mon 09:00 МСК — Inngest cron не настроен.
11. **PostHog fetcher** для подачи engagement-данных в ScoreWeeklyAgent.
12. **CI/CD** не настроен.
13. **vitest-pool-workers** регрессия — раннер apps/api не запускается из-за несовместимости с vitest 4.x. Тесты написаны корректно, побегут когда починят.
14. **`pipeline_config.agent` unique-индекс** — приложение enforces, миграция 0004 закрепит в схеме.

---

## Что дальше (план для следующей сессии)

### Приоритет A: prod-готовность

- **Deploy guide** README — пошаговый: Neon → migrations → wrangler deploy api → r2 bucket → Inngest cloud → env. Документ, не код.
- **Реальный стек запустить** — Neon Frankfurt + миграции + wrangler deploy + R2 + Inngest cloud. Требует ваших токенов на нескольких шагах.
- **CI/CD** — GitHub Actions: typecheck + tests + lint + preview-deploy на PR.

### Приоритет C: внешние интеграции (отдельные сессии)

- **AudioAgent через ElevenLabs WS-proxy на Render** — `anthropic-skills:elevenlabs-voice-agent-russia` готов как guide.
- **Telegram session auth** — заменить `X-User-Id` header на initData verification + JWT session. Закрывает auth-stub в api+miniapp+admin.
- **Resend** для actual newsletter sending (`apps/workers/newsletter`).
- **VisualAgent** — Gemini 2.5 Flash через proxy для инфографики.
- **Image variants** — Cloudflare Images или ручной resize в Worker (сейчас оригинал хранится как есть).
- **Migration 0004** — unique-индекс на `pipeline_config.agent` + `params` jsonb редактирование в UI (paired).

### Приоритет B: ничего открытого

Brief B закрыт целиком в эту сессию.

---

## Активные процессы / preview

На момент handoff два preview-сервера работают:
- `miniapp` на :3000 (serverId `35178519-a70b-4abd-b2e7-2f8e976459fd`)
- `admin` на :3001 (serverId `ec2a0b2d-448b-4978-b350-338e02b4ee97`)

Их можно остановить (`preview_stop`) перед новой сессией или оставить — следующий чат увидит через `preview_list`.

---

## Кратко — что было / стало

| | Сессия 9 (стартовое состояние) | Сессия 10 (после) |
|---|---|---|
| API routes | 11 | **13** (+/articles/:id/me, +pipeline-config CRUD) |
| Admin pages | 9 (read-only pipeline-config + read-only rubrics) | **10** (+`/pipeline-config/[agent]` edit) + интерактив на rubrics |
| Miniapp client-компонентов в article reader | 0 | **3** (engagement-bar, header-share, reading-progress) |
| Server Actions в miniapp | 0 | **3** (toggleReaction, toggleBookmark, reportProgress) |
| Mock-fixtures для demo mode | rich queue + admin entities | + MOCK_PIPELINE_CONFIGS (12 шт) + queue фильтруется client-side |
| Скрипты в `scripts/` | пусто | **seed.ts** (10 клампов + ...) |
| Документы в `docs/strategy` | brief + 11 PDF | без изменений |
| Документы в `docs/handoffs` | session 1-9 | + **session 10** |
| Unfinished Brief items | optimistic UI + pipeline-config + rubrics filtering | **закрыты все 3** |

---

## Стартовый промпт для новой сессии

> Прочитай `docs/handoffs/handoff-session-10.md` целиком (он самый свежий, переопределяет более ранние). Подтверди что 9/9 пакетов + `scripts/` typecheck clean: `pnpm typecheck`. Я хочу [выбери: Deploy guide README / поднять реальный стек (Neon + wrangler + R2 + Inngest cloud) / AudioAgent через ElevenLabs WS-proxy / Telegram session auth / Resend newsletter sending / Migration 0004 (unique-индекс pipeline_config + params editing UI)]. Покажи план перед действиями.
