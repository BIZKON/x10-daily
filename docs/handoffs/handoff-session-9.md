# Handoff · Session 9

**Дата:** 27 мая 2026
**Что закрыто:** Layer 5a → 5b + Content Architecture Brief Этапы 1-3 (3a→3g) + admin demo mode + sidebar «Настройки»
**Репозиторий:** https://github.com/BIZKON/x10-daily
**HEAD после сессии:** этот handoff будет последним коммитом — 9-м за сессию.

---

## Git коммиты сессии (8 + handoff)

Все изменения закоммичены **до** этого handoff'a. Раскладка по логическим единицам:

```
849fd01  docs(strategy): X10 Content Architecture Brief v1.0
55e1e2f  feat(admin): Next.js 16 + HumanGate + CRUD + R2 upload + demo mode
72d3029  feat(miniapp): API integration + 3 template cards + community/profile
e2f1b1e  feat(api): admin CRUD + public API + engagement + R2 upload (11 routes)
e6b3f35  feat(db): Content Architecture Brief schemas + 3 migrations
6c1f8ca  feat(pipeline): extended draft-article workflow + 3 Inngest functions
bb1676a  feat(agents): 8 new agents + template-aware DraftAgent/Brevity (Layer 5)
fdffc7c  chore(workspace): preview launch config + lockfile updates
```

Каждый коммит самодостаточен, typecheck проходит на каждом коммите.

---

## Что закрыто за сессию (16 чаптеров)

Хронологический список того, что было сделано в работе (более детально, чем коммиты).

### 1. Layer 5a — Brevity + HookGen

`packages/agents/src/agents/{brevity,hookgen}.ts` + workflow + 5 тестов.

- **BrevityAgent** (Sonnet) — сжимает до ≤300 слов / 25-30 сек, сохраняет numbers/callouts.
- **HookGenAgent** (Haiku) — 6 паттернов (number-led/contrarian/transformation/authority/admission/future-shock) × 5 каналов.
- Workflow `draft-article` стал: `DRAFT → (NUMBERS∥TOV) → BREVITY → (HOOKGEN∥PERSIST)`.

### 2. Skills port (social-media-skills v1.0)

Github `charlie947/social-media-skills` — клонирован в `/tmp`, прочитано 4 skill'a, инкорпорированы в @x10/agents.

- HookGenAgent доточен правилами hook-generator (no questions in opener, no em-dash, digits, двухстрочка ≤40 для LinkedIn/TG).
- **SocialAmplifyAgent** (Sonnet) — per-channel пост из compressed draft, frameworks PAS/AIDA/BAB/STAR/SLAY. Дефолт-канал `tg-x10`.
- **PreviewScoreAgent** (Sonnet) — scorecard 5×10 (hookStrength/voiceMatch/valueDensity/structureFormat/publishReadiness) + verdict + fixes[].
- Workflow расширен: `BREVITY → (HOOKGEN∥SOCIAL∥SCORE∥PERSIST)` (4 параллельных).

### 3. Layer 5b — 4 агента + 3 workflow

`packages/agents/src/agents/{factcheck,ingest,score-weekly,newsletter}.ts` + `apps/workers/pipeline/src/inngest/functions/{process-source-item,assemble-newsletter,run-weekly-score}.ts`.

- **FactCheckAgent** (Opus 4.7) — cross-source verification, halt-on-disagreement. **Условно** в draft-article: только если `event.data.political === true`. Halt → throw, статья не идёт дальше.
- **IngestAgent** (Haiku) — relevance filter + классификация (accept/reject/duplicate), флаг political.
- **ScoreWeeklyAgent** (Sonnet) — weekly engagement analytics, hook pattern ranking, до 5 config-рекомендаций.
- **NewsletterAssembleAgent** (Sonnet) — daily issue: subject + 2-3 A/B variants + 7 секций.
- 3 новых event-схемы: `source.item.received`, `newsletter.assemble.requested`, `score.weekly.requested`.
- 4 функции зарегистрированы в `apps/workers/pipeline/src/index.ts`.

### 4. miniapp → real API (handoff-session-8 §5d)

`apps/miniapp/src/lib/{api,feed}.ts` + `.env.local.example`.

- `fetchFeed(limit, {category, template})` + `fetchArticle(slug)` с 4-сек timeout, graceful null.
- `mapApiItem`: API row → FeedItem с placeholder imageUrl per category.
- Mock fallback если `X10_API_BASE_URL` не задан или API упал.
- Проверено в preview: моки рендерятся при отсутствии env и при unreachable URL.

### 5. HumanGate MVP

- `persistArticle` принимает `pipelineMetadata` — все agent outputs (scorecard/hooks/social/factcheck/brevity/totalCost) сохраняются в `articles.metadata` jsonb.
- Workflow реструктурирован: persist стал **последним** (а не параллельным с hookgen/social/score) — иначе metadata недоступна.
- `apps/api/src/routes/admin.ts`: `GET /v1/admin/queue`, `GET /v1/admin/article/:id`, `POST /v1/admin/publish/:id`.
- `apps/admin` (Next.js 16 + Tailwind v4) scaffold: queue page + article detail (со scorecard, hooks, social preview, factcheck, brevity cuts) + publish action.

### 6. Content Architecture Brief v1.0 — добавлен в репо

`docs/strategy/X10ContentArchitectureBrief.md` — это **новая спека**, переопределяющая контент-онтологию относительно CLAUDE.md.

**Главные тезисы**:
- 6 user-facing рубрик первого уровня: `taxes / money / practice / power / tech / rybakov` (brief §1, §5).
- 4-5 шаблонов: `card-news / deep-dive / daily-take / guide / digest` (brief §3).
- 7 новых сущностей вне articles: authors, klamps, events, digests, bookmarks, reactions, reading_history (brief §6).
- M0 scope (brief §10): 5 экранов, 4 категории, 3 шаблона, ручной digest, push 7:00.

Дальнейшие 7 этапов (3a-3g) — реализация brief'a.

### 7. Brief Этап 1 — таксономия

`packages/db/drizzle/0001_content_architecture.sql` + schema + pipeline + UI.

- 2 новых enum: `article_category` (6 рубрик), `article_template` (5 шаблонов).
- В articles: `category`/`subcategory`/`template`/`tags`/`cover_image_url`/`cover_image_alt`/`is_featured`/`reactions` jsonb/`comment_count`/`bookmark_count`/`share_count`.
- Backfill в SQL: legacy section → category mapping.
- IngestAgent возвращает category/subcategory/template/tags (заменил section).
- DraftAgent/events/persist пробрасывают через workflow.
- API `/v1/feed/daily` + `/v1/admin/queue` отдают новые поля.
- miniapp `HOME_CATEGORIES` обновлены: Налоги/Деньги/Практика/Власть/Технологии/Рыбаков говорит.
- admin queue + article detail показывают category/template badges + tags.

### 8. Brief Этап 2 — шаблоны (templates)

`packages/config/src/constants.ts` (TEMPLATE_LIMITS) + agents + UI.

- `TEMPLATE_LIMITS` per template (card-news: 300/120 слов, deep-dive: 2000/800, daily-take: 200/50, guide: 2500/1000).
- DraftAgent / BrevityAgent — **под капотом 4 sub-агента**, один на каждый template (разные system prompts, разные maxOutputTokens). Внешний API `DraftAgent.run(input)` тот же.
- workflow прокидывает `template` в Draft+Brevity.
- 3 новых React-компонента: `<NewsCard>`, `<DeepDiveCard>` (64h hero + золотой бейдж «Глубокий разбор»), `<DailyTakeCard>` (аватарка автора + цитата курсивом). `<FeedCard>` стал router'ом.
- Article reader разводит layout: daily-take заменяет hero на quote-header с аватаркой автора; deep-dive добавляет бейдж поверх hero.

### 9. Brief Этап 3a — 7 новых таблиц БД

`packages/db/src/schema/{authors,klamps,events,digests,user_engagement}.ts` + migration 0002.

- **authors** — slug/name/role/bio/avatar/bylineColor/isStaff/isFlagship/subscriberCount + optional userId. `isFlagship=true` для Игоря Рыбакова.
- **klamps** — slug/name/city/country/leadName/memberCount/isOpen/meetingSchedule/description/goal.
- **events** + enum `event_type` (kod-x10/meet-up/breakfast/festival/webinar). venue как jsonb. speakerIds[] → authors.
- **digests** — issueDate unique (один на день), intro, topArticleIds[], rybakovTake jsonb, premiumTeaser jsonb, sentAt.
- **reactions** + enum `reaction_kind` (fire/insight/question). Composite PK (user, article, kind).
- **bookmarks** — composite PK (user, article).
- **user_reading_history** — readPercent/completed/readSeconds/lastReadAt.
- **articles.author_id** переехал: старая `→users.id` стала `legacy_author_user_id`, новая `author_id → authors.id`.

### 10. Brief Этап 3b — public API

`apps/api/src/routes/{community,events,authors,digests}.ts`.

- `GET /v1/community/klamps`, `/:slug`, `/stats` — статистика для CommunityStats.
- `GET /v1/events`, `/:slug` — с computed `seatsLeft`.
- `GET /v1/authors`, `/:slug?articlesLimit=` — автор + последние статьи.
- `GET /v1/digests/latest`, `/:date` — с expanded `topArticles` (JOIN с articles по inArray).

### 11. Brief Этап 3c — miniapp /community

`apps/miniapp/src/lib/community.ts` + page.

- `loadCommunityStats` / `loadCommunityEvents` с mock fallback.
- Mapper event: ISO startDate → `date`+`month` (русские «апр»/«мая»), type → tone (kod-x10/meet-up=red, festival/webinar=gold, breakfast=steel).
- Page: 4 секции вынесены отдельно, async с `'use cache'` + Suspense + skeletons.
- `MY_CLUMP` оставлен мок (нужна auth + user_clump_memberships).

### 12. Brief Этап 3d — engagement backend

`packages/db/drizzle/0003_engagement_triggers.sql` + auth + 6 endpoints.

- **Triggers**: `update_article_reactions_counter` (INSERT/DELETE на reactions → jsonb_set на articles.reactions), `update_article_bookmark_counter`, `mark_reading_completed` (BEFORE INSERT/UPDATE — если read_percent ≥ 90 → completed=true).
- `apps/api/src/auth.ts` — `extractUserId(c)` через `X-User-Id` header. **MVP stub** до Telegram session.
- `POST /v1/articles/:id/reactions` — toggle per kind. Возвращает обновлённые reactions counts (триггер синкает).
- `POST /v1/articles/:id/bookmark` — toggle, возвращает `{isBookmarked, bookmarkCount}`.
- `POST /v1/articles/:id/progress` — UPSERT через `onConflictDoUpdate`, `read_percent = GREATEST(old, new)`.
- `GET /v1/profile/{bookmarks,history,stats}` — последние JOINы + агрегаты + computed `ipsScore`, `streakDays`, `weekActivity[7]`.
- miniapp `/profile` подключён к `/v1/profile/stats` через `loadProfileSnapshot` с mock fallback. `X10_DEV_USER_ID` env (server-side) для X-User-Id.

### 13. Brief Этап 3e — admin CRUD list pages

`apps/api/src/routes/admin-content.ts` + sidebar + 4 list-страницы.

- 13 endpoints: POST/PATCH/DELETE для authors/klamps/events/digests + `POST /digests/:id/mark-sent`.
- Sidebar (client component с usePathname) — новая секция «Контент» с lucide иконками.
- `/authors`, `/klamps`, `/events` (Предстоящие/Прошедшие split), `/digests` (latest).

### 14. Brief Этап 3f — create/edit forms

`apps/admin/src/components/form/` + 12 файлов в `app/{authors,klamps,events,digests}/`.

- Generic `adminMutate(method, path, body)` helper с X-User-Id.
- Form UI: `<Field>`, `<TextInput>` (text/url/number/datetime-local/date/email), `<TextArea>`, `<SelectInput>`, `<CheckboxInput>`, `<SubmitButton>` (useFormStatus), `<DeleteButton>` (confirm).
- 12 server actions: create/update/delete + mark-sent (digests).
- datetime-local ↔ ISO конвертация в events.
- jsonb-поля (venue, rybakovTake, premiumTeaser) через `<textarea>` с JSON parse.
- Array поля (topArticleIds, speakerIds) split по `\n` или `,`.

### 15. Brief Этап 3g — image upload (R2)

`apps/api/src/routes/upload.ts` + `apps/admin/src/{app/upload-action.ts, components/form/image-url-field.tsx}`.

- Backend: `POST /v1/admin/upload` multipart, mime+size validation, R2.put, key `{YYYY}/{MM}/{userId}/{ts}-{rand}.{ext}`. 503 если R2 не настроен.
- wrangler.toml: `[[r2_buckets]]` блок закомментирован с инструкцией.
- worker-configuration.d.ts: `X10_IMAGES?: R2Bucket`.
- env.ts: `getImagesConfig()` returns `{bucket, publicBase} | null`.
- `<ImageUrlField>` client component: hidden input (для server action) + URL textbox + file upload button с loader + preview карточка.
- upload-action.ts — server action proxy с X-User-Id (client не имеет доступа к серверному env).
- Author form (avatarUrl) + Event form (coverImageUrl) интегрированы.

### 16. Admin demo mode + sidebar «Настройки»

`apps/admin/src/lib/mocks.ts` + `components/demo-banner.tsx` + 3 страницы для «Скоро».

**Demo mode**: rich fixtures для всех 5 сущностей. Стабильные UUID/slug → клик по карточке очереди ведёт на корректную detail. `isDemoMode()` (true когда нет `X10_API_BASE_URL`). Жёлтая полоса DemoBanner объясняет состояние явно. Activated в каждом fetcher как fallback.

**Sidebar «Скоро» → «Настройки»**:
- `/rubrics` — статический обзор 6 рубрик из brief §1 с подкатегориями, cadence, benchmarks.
- `/video` — roadmap-заглушка: «brief §12 — не делаем встроенную видеоплатформу, embed YouTube». 6-step checklist до полного CRUD.
- `/pipeline-config` — 13 агентов из CLAUDE.md §4 с tier badges (Opus/Sonnet/Haiku/External) + status (✓ работает / ⊙ scaffold / ○ план). Read-only.

---

## Что работает (проверено в preview)

### Тесты — 50 vitest зелёных

- `@x10/agents` — **33 теста** (было 14 на старте сессии 8). Покрывает: Draft (3 template), Numbers, ToV, Brevity (3 template), HookGen (3 кейса), SocialAmplify (2), PreviewScore (2), FactCheck (2), Ingest (3 включая system-prompt check), ScoreWeekly, Newsletter, masker integration.
- `@x10/worker-pipeline` — **17 тестов** (было 9). Покрывает: persist helpers + draft-article orchestration (8 кейсов включая political halt) + process-source-item (3) + assemble-newsletter + run-weekly-score.
- Все 7 пакетов `pnpm -r typecheck` — clean.

### Что собрано

| Слой | Состояние |
|---|---|
| @x10/config | TEMPLATE_LIMITS, MODELS, PERF_BUDGETS, BREVITY_LIMITS |
| @x10/db | 8 schema-файлов (articles + 7 новых), 4 migrations (0000, 0001, 0002, 0003), 2 enum (category, template) + 2 enum (event_type, reaction_kind) |
| @x10/voice | без изменений (VOICE_RULES, ABOUT_ME, BLACKLIST) |
| @x10/agents | **9 агентов**: Draft (4 sub per template), Numbers, ToV, Brevity (4 sub), HookGen, SocialAmplify, PreviewScore, FactCheck, Ingest, ScoreWeekly, NewsletterAssemble |
| @x10/ui | без изменений |
| apps/api | **11 routes**: health, feed, articles, pipeline, admin (queue/article/publish), admin-content (CRUD x4 + mark-sent), upload (R2), community, events, authors, digests, engagement (reactions/bookmark/progress), profile |
| apps/workers/pipeline | 4 Inngest functions: draft-article (5-9 steps), process-source-item, assemble-newsletter, run-weekly-score |
| apps/miniapp | 5 экранов: лента, статья (3 template-layout), Налоги, Видео, Х10 (community с API), Я (profile с API + week streak) |
| apps/admin | sidebar + 9 страниц: queue, article detail, authors (list/new/edit), klamps (list/new/edit), events (list/new/edit), digests (list/new/edit), rubrics, video, pipeline-config |

### Локальный dev-flow (5 терминалов)

```bash
# Terminal 1 — apps/api (admin endpoints, public feed, engagement, upload)
cd apps/api && pnpm wrangler dev --port 8788

# Terminal 2 — pipeline worker (Inngest functions)
pnpm -F @x10/worker-pipeline dev

# Terminal 3 — Inngest dev server (auto-discovers /inngest endpoint)
pnpm -F @x10/worker-pipeline inngest:dev   # :8288 UI

# Terminal 4 — miniapp (TG/MAX Mini App preview)
pnpm -F @x10/miniapp dev   # :3000

# Terminal 5 — admin (HumanGate + CRUD редколлегии)
pnpm -F @x10/admin dev   # :3001
```

### Env переменные (.env.local)

**apps/miniapp/.env.local** (опц., см. `.env.local.example`):
```
X10_API_BASE_URL=http://localhost:8788
X10_DEV_USER_ID=<UUID-из-users-таблицы>      # для /profile auth-stub
```

**apps/admin/.env.local** (опц., см. `.env.local.example`):
```
X10_API_BASE_URL=http://localhost:8788
X10_ADMIN_USER_ID=<UUID-с-role-editor-или-admin>   # для admin actions
```

**apps/api/.dev.vars** (опц., см. `.dev.vars.example`):
```
DATABASE_URL=postgresql://...                # Neon Frankfurt
ANTHROPIC_API_KEY=sk-ant-...
MASKER_BASE_URL=...
MASKER_API_KEY=...
INNGEST_EVENT_KEY=...
X10_IMAGES_PUBLIC_BASE=https://images.x10daily.com   # для R2 endpoint
```

### Demo mode

При отсутствии `X10_API_BASE_URL` в admin — автоматический mock fallback: 3 статьи в очереди, 4 автора (включая Рыбакова flagship), 5 клампов (Краснодар/Москва/СПб/Алматы/Дубай), 5 событий, 1 digest. Жёлтый banner вверху объясняет. Клик по карточке очереди → полный article detail mock с scorecard 5×10, 6 hooks, social preview, factcheck.

---

## Не работает / нужно для prod (порядок зависимостей)

1. **БД не развёрнута** — Neon Frankfurt не создан, миграции 0000/0001/0002/0003 не применены.
2. **apps/api worker** не задеплоен — `wrangler deploy` ни разу.
3. **R2 bucket** не создан — `wrangler r2 bucket create x10-images` + `wrangler r2 bucket create x10-images-preview`.
4. **R2 binding в wrangler.toml** закомментирован — раскомментировать после создания bucket'a.
5. **Anthropic ZDR контракт** не подписан → первый LLM-вызов в prod нарушает 152-ФЗ (см. CLAUDE.md §7).
6. **KikuAI Masker** не задеплоен на Render. `MASKER_BASE_URL`/`MASKER_API_KEY` пустые.
7. **Inngest cloud** — нужно зарегистрироваться, получить `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`.
8. **Auth** — `X-User-Id` header это MVP stub. Нужна Telegram initData verification (CLAUDE.md §2 «Telegram initData + MAX OAuth + email magic link»).
9. **Cron-функции** — daily ingest 06:00 МСК, newsletter 06:00 МСК, weekly score Mon 09:00 МСК — Inngest cron не настроен.
10. **PostHog fetcher** для подачи engagement-данных в ScoreWeeklyAgent.
11. **CI/CD** не настроен — handoff-8 уже отмечал это.

---

## Что дальше (план для следующей сессии)

### Приоритет A: prod-готовность

- **Git commits** — разбить 60+ uncommitted файлов на коммиты (см. §«Что закрыто за сессию», 16 чаптеров — готовая раскладка).
- **Seed-скрипт** `scripts/seed.ts` — 10 клампов, 5 авторов, 3 события, 2 article, 1 digest. Чтобы редколлегия могла потестить admin с реальной БД.
- **Deploy guide** — пошаговый README: Neon → migrations → wrangler deploy api → r2 bucket → Inngest cloud → env.

### Приоритет B: закрытие brief'a

- **Article reader optimistic UI** ≤16мс (brief §11 PERF) — подключение POST `/v1/articles/:id/{reactions,bookmark,progress}` в miniapp с TanStack Query mutations или Server Actions. Кнопки реакций в article reader сейчас не привязаны.
- **Pipeline config edit UI** — backend готов (`pipeline_config` table + `agentKind` enum), edit-form через `/pipeline-config/[agent]/page.tsx` с toggle enabled + model override + confidence threshold.
- **Rubrics filtering** — query-params `?category=&subcategory=` в `/v1/admin/queue` + кликабельные subcategory в /rubrics.

### Приоритет C: внешние интеграции (отложено на собственные сессии)

- **AudioAgent** — ElevenLabs WS-proxy на Render (skill `anthropic-skills:elevenlabs-voice-agent-russia` готов).
- **VisualAgent** — Gemini 2.5 Flash через proxy для инфографики.
- **Resend** для actual newsletter sending (отдельный `apps/workers/newsletter`).
- **Image variants** — Cloudflare Images или ручной resize в Worker (сейчас оригинал хранится как есть).
- **Telegram session auth** — заменить `X-User-Id` header на Telegram initData verification.

---

## Активные процессы / preview

На момент handoff два preview-сервера работают:
- `miniapp` на :3000
- `admin` на :3001

Их можно остановить (`preview_stop`) перед новой сессией или оставить — следующий чат увидит их через `preview_list`.

---

## Кратко — что было / стало

| | Сессия 8 (стартовое состояние) | Сессия 9 (после) |
|---|---|---|
| Агентов в @x10/agents | 3 (Draft/Numbers/ToV) | 9 |
| Inngest functions | 1 (draft-article) | 4 (+process-source-item +assemble-newsletter +run-weekly-score) |
| API routes | 4 (health/feed/articles/pipeline) | 11 (+admin +admin-content +upload +community +events +authors +digests +engagement +profile) |
| apps/admin | — (только пустой package.json) | 9 страниц + sidebar + form components + demo mode |
| DB schemas | 7 (users/sources/ingest/articles/pipeline/subscriptions/embeddings) | 12 (+authors +klamps +events +digests +user_engagement) |
| Migrations | 1 (0000_core) | 4 (+0001_content_architecture +0002_community_engagement +0003_engagement_triggers) |
| Vitest тестов | 23 (14+9) | 50 (33+17) |
| Документы в docs/strategy | 11 PDF + 1 md | +1: X10ContentArchitectureBrief.md |

---

## Стартовый промпт для новой сессии

> Прочитай `docs/handoffs/handoff-session-9.md` целиком, потом `docs/strategy/X10ContentArchitectureBrief.md` (он переопределил часть CLAUDE.md). Подтверди что 7/7 пакетов typecheck clean: `pnpm -r typecheck`. Я хочу [выбери: поднять реальный стек (Neon + wrangler + R2 + Inngest cloud) / seed-скрипт / article reader optimistic UI / pipeline-config edit UI / AudioAgent через ElevenLabs / Telegram session auth]. Покажи план перед действиями.
