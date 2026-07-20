# Deploy Guide — АРХИВ X10-эпохи (CF/Neon/Vercel-путь)

> ⚠️ **АРХИВ.** Документ описывает старый Cloudflare/Neon/Vercel-стек и бренд X10 Daily.
> Фактический прод ProAgent AI живёт на одной VM (Timeweb Cloud, РФ):
> `docker compose --env-file .env.production` + Caddy; деплой — `./deploy.sh` из корня репо
> (см. README.md «Деплой (prod)»). Ниже — исторический чек-лист, НЕ применять как есть.

Пошаговый чек-лист для развёртывания production-стека из чистого workspace.

**Цель чтения:** один проход документа = развёрнутая инфраструктура (БД + API + worker + R2 + Inngest), готовая принимать запросы из miniapp/admin.

**Время:** ~60-90 мин с нуля без опыта с CF/Neon. ~30 мин если стек уже знаком.

**Стоимость первого месяца:** ~$0. Все компоненты вписываются в free-tier на этом масштабе (24K DAU цель — на платных уровнях, не сейчас).

---

## 0. Pre-requirements

### Аккаунты, которые нужны (создаются один раз)

| Сервис | Зачем | Free-tier | URL |
|---|---|---|---|
| **Neon** | Postgres (БД) | 0.5 GB · 1 CPU · 1 проект | https://neon.tech |
| **Cloudflare** | Workers (API + pipeline) + R2 (images) | 100K req/day · 10 GB R2 | https://dash.cloudflare.com |
| **Inngest** | Workflow engine для AI-агентов | 50K runs/мес | https://inngest.com |
| **Vercel** | miniapp + admin (Next.js 16) | 100 GB bandwidth · Hobby plan | https://vercel.com |

**Откладываем до первого LLM-вызова** (см. CLAUDE.md §7 и финальную секцию ниже):
- **Anthropic ZDR-контракт** — обязателен до production LLM-трафика с ПДн. Без него input/output логируются 30 дней → нарушение 152-ФЗ.
- **KikuAI Masker self-hosted** — PII redaction между приложением и Anthropic.

### Локальные инструменты

```bash
node -v        # ≥ 22
pnpm -v        # ≥ 10 (managed через packageManager в package.json)
wrangler --version   # ставится через pnpm: pnpm dlx wrangler@latest --version
```

Если `wrangler` глобально не стоит — все команды ниже работают через `pnpm --filter @x10/api exec wrangler ...` (он есть в devDeps пакета).

### Workspace local-state

```bash
# Корневой .env (gitignored) с DATABASE_URL — нужен для миграций и seed.
cp .env.example .env

# Wrangler dev-vars для apps/api (gitignored).
cp apps/api/.dev.vars.example apps/api/.dev.vars

# Аналогично для pipeline worker (если есть .example).
```

---

## 1. Neon Postgres (Frankfurt)

### 1.1 Создать проект

1. Войти https://console.neon.tech → New Project.
2. **Region:** `Europe (Frankfurt)` — **критично** для 152-ФЗ и latency CF Workers EU.
3. **Name:** `x10-daily-prod`.
4. **Postgres version:** 17 (default).

### 1.2 Достать connection strings

Neon даёт две формы URL — обе сохраняем:

- **Pooled** (для CF Workers через HTTP-driver `@neondatabase/serverless`) — это и есть `DATABASE_URL`.
- **Direct** (без пулинга, для миграций drizzle-kit) — это `DIRECT_DATABASE_URL`.

Положить в корневой `.env`:

```bash
DATABASE_URL='postgresql://USER:PASS@ep-xxxx-pooler.eu-central-1.aws.neon.tech/x10?sslmode=require'
DIRECT_DATABASE_URL='postgresql://USER:PASS@ep-xxxx.eu-central-1.aws.neon.tech/x10?sslmode=require'
```

### 1.3 Smoke test connection

```bash
pnpm --filter @x10/db exec drizzle-kit introspect 2>&1 | head -5
# Должно подключиться и сказать что таблиц нет (или показать существующие).
```

---

## 2. Database init

### 2.1 Применить миграции

```bash
pnpm --filter @x10/db db:migrate
# Применяет 0000_core → 0001_content_architecture → 0002_community_engagement → 0003_engagement_triggers.
```

После этого в БД:
- 12 таблиц (users, sources, ingest, authors, articles, pipeline_runs, pipeline_config, subscriptions, embeddings, klamps, events, digests, reactions, bookmarks, user_reading_history).
- 4 enum'a (article_category, article_template, event_type, reaction_kind + остальные из core).
- 3 trigger'a (counter sync для reactions/bookmarks, mark_reading_completed).

### 2.2 Залить seed-фикстуры

```bash
pnpm db:seed
# 4 users · 5 authors · 10 klamps · 3 events · 2 articles · 1 digest
```

Идемпотентно — повторный запуск без ошибок. Стабильные UUID совпадают с `apps/admin/src/lib/mocks.ts`, demo-banner в admin исчезнет автоматически.

### 2.3 Verify

```bash
psql "$DIRECT_DATABASE_URL" -c "SELECT count(*) FROM users; SELECT count(*) FROM articles;"
# users → 4, articles → 2
```

---

## 3. R2 bucket (для изображений)

### 3.1 Login wrangler

```bash
pnpm --filter @x10/api exec wrangler login
# Откроет браузер для авторизации в CF.
```

### 3.2 Создать buckets

```bash
pnpm --filter @x10/api exec wrangler r2 bucket create x10-images
pnpm --filter @x10/api exec wrangler r2 bucket create x10-images-preview
# Preview-bucket нужен для local dev (wrangler dev --remote).
```

### 3.3 Раскомментировать binding

Открыть [apps/api/wrangler.toml](apps/api/wrangler.toml) и убрать `#` с блока `[[r2_buckets]]`:

```toml
[[r2_buckets]]
binding = "X10_IMAGES"
bucket_name = "x10-images"
preview_bucket_name = "x10-images-preview"
```

### 3.4 (Опц.) Custom domain

Без custom domain R2 отдаёт через `pub-XXXX.r2.dev` — годится только для тестов. Для prod:

```bash
pnpm --filter @x10/api exec wrangler r2 bucket domain add x10-images images.x10daily.com
```

Затем `X10_IMAGES_PUBLIC_BASE=https://images.x10daily.com` в [apps/api/wrangler.toml](apps/api/wrangler.toml) под `[vars]`.

---

## 4. apps/api deploy (Hono на CF Workers)

### 4.1 Secrets

```bash
cd apps/api

# Обязательные:
pnpm exec wrangler secret put DATABASE_URL          # вставить pooled URL из шага 1.2
pnpm exec wrangler secret put DIRECT_DATABASE_URL   # direct URL

# Telegram session auth (HIGH-2) — required в production:
pnpm exec wrangler secret put TELEGRAM_BOT_TOKEN    # формат <id>:<secret> от @BotFather
pnpm exec wrangler secret put X10_JWT_SECRET        # 32+ байта: openssl rand -base64 48
# X10_JWT_TTL_SECONDS опционально, default 86400 (24h)

# CORS allowlist (HIGH-1):
pnpm exec wrangler secret put X10_ALLOWED_ORIGINS   # "https://daily.x10.media,https://admin.x10.media"

# Опциональные на этом этапе (нужны когда поднимем pipeline + LLM):
# pnpm exec wrangler secret put ANTHROPIC_API_KEY
# pnpm exec wrangler secret put ANTHROPIC_ZDR_CONFIRMED   # "true" после подписания ZDR
# pnpm exec wrangler secret put MASKER_BASE_URL
# pnpm exec wrangler secret put MASKER_API_KEY
# pnpm exec wrangler secret put INNGEST_EVENT_KEY
# pnpm exec wrangler secret put INNGEST_SIGNING_KEY
```

**Важно**: без `TELEGRAM_BOT_TOKEN` и `X10_JWT_SECRET` `loadEnv` падает на boot в prod. Это by design — без auth не запускаемся.

### 4.2 Deploy

```bash
pnpm --filter @x10/api deploy
# wrangler deploy → выдаст URL вида https://x10-api.<acct>.workers.dev
```

Запомнить URL — он будет `X10_API_BASE_URL` для miniapp/admin.

### 4.3 Smoke test

```bash
API=https://x10-api.<acct>.workers.dev

curl -s $API/health | jq .
# {"status": "ok", "service": "x10-api", "env": "production"}

curl -s $API/v1/feed/daily?limit=2 | jq '.items[].slug'
# Из seed: "tsb-derzhit-stavku-17", "wildberries-kupil-tri-taksi"

# Admin endpoint требует Authorization: Bearer <JWT> (HIGH-2 — после session 11).
# Получить токен можно через TG Mini App или admin Login Widget; для smoke-теста
# в staging — временно поднять NODE_ENV=development и заюзать /v1/auth/dev-login:
USER_ID=$(psql "$DIRECT_DATABASE_URL" -tAc "SELECT id FROM users WHERE role='editor' LIMIT 1")
TOKEN=$(curl -s -X POST "$API/v1/auth/dev-login" \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"$USER_ID\"}" | jq -r .token)
curl -s -H "Authorization: Bearer $TOKEN" $API/v1/admin/pipeline-config | jq '.items | length'
# → 12
```

---

## 5. Inngest cloud (workflow engine)

### 5.1 Account + app

1. Sign up https://app.inngest.com.
2. Create new app: `x10-pipeline` (production env).
3. Скопировать **Event Key** и **Signing Key**.

### 5.2 Secrets для pipeline worker

```bash
cd apps/workers/pipeline

pnpm exec wrangler secret put DATABASE_URL
pnpm exec wrangler secret put DIRECT_DATABASE_URL
pnpm exec wrangler secret put INNGEST_EVENT_KEY      # из шага 5.1
pnpm exec wrangler secret put INNGEST_SIGNING_KEY    # из шага 5.1

# Когда подпишете Anthropic ZDR + поднимете Masker (см. §10):
# pnpm exec wrangler secret put ANTHROPIC_API_KEY
# pnpm exec wrangler secret put MASKER_BASE_URL
# pnpm exec wrangler secret put MASKER_API_KEY
```

### 5.3 Deploy pipeline worker

```bash
pnpm --filter @x10/worker-pipeline deploy
# wrangler deploy → URL вида https://x10-worker-pipeline.<acct>.workers.dev
```

### 5.4 Зарегистрировать endpoint в Inngest

В Inngest dashboard → Apps → x10-pipeline → Sync new app:

```
https://x10-worker-pipeline.<acct>.workers.dev/inngest
```

Inngest сделает discovery, увидит 4 функции:
- `draft-article` (Layer 5)
- `process-source-item`
- `assemble-newsletter`
- `run-weekly-score`

### 5.5 Smoke test — отправить event

```bash
API=https://x10-api.<acct>.workers.dev

# Pipeline-run endpoint в apps/api отправляет event в Inngest cloud:
curl -s -X POST -H "X-User-Id: $USER_ID" -H "Content-Type: application/json" \
  -d '{"sourceItemId":"00000000-0000-0000-0000-000000000999"}' \
  $API/v1/pipeline/run | jq .
```

В Inngest dashboard → Runs появится новый run. **Упадёт** без `ANTHROPIC_API_KEY` — это ожидаемо, см. §10.

---

## 6. apps/miniapp + apps/admin deploy (Vercel)

Next.js 16 с PPR — идеально для Vercel Fluid Compute. Альтернатива (CF Pages) тоже работает, но Vercel — путь по умолчанию (CLAUDE.md §2).

### 6.1 Vercel CLI login

```bash
pnpm dlx vercel login
```

### 6.2 Deploy miniapp

```bash
cd apps/miniapp
pnpm dlx vercel link              # выбрать или создать проект "x10-miniapp"
pnpm dlx vercel env add X10_API_BASE_URL production
# Вставить URL из шага 4.2

# X10_DEV_USER_ID больше не нужен — auth идёт через initData в TG WebView.
# Для preview-deploys без TG WebView оставьте env пустым, miniapp работает в anon-режиме.

pnpm dlx vercel --prod
# → https://x10-miniapp-<acct>.vercel.app
```

### 6.3 Deploy admin

Аналогично — `apps/admin`:

```bash
cd apps/admin
pnpm dlx vercel link              # "x10-admin"
pnpm dlx vercel env add X10_API_BASE_URL production
pnpm dlx vercel env add NEXT_PUBLIC_TELEGRAM_BOT_USERNAME production
# Без @ — например "x10daily_bot". Должен совпадать с зарегистрированным
# login_domain в @BotFather (см. §6.4).

# X10_ADMIN_USER_ID больше не нужен — auth идёт через TG Login Widget на /login.

pnpm dlx vercel --prod
# → https://x10-admin-<acct>.vercel.app
```

Открыть admin URL → middleware редиректит на `/login` → TG Login Widget. После успешного входа (роль editor/admin) — попадёшь на queue page без demo-banner.

### 6.4 @BotFather setup для Telegram session auth (HIGH-2)

Telegram session auth работает в двух режимах — оба используют один и тот же BOT_TOKEN:

**A. Mini App initData** (miniapp) — не требует доменной регистрации. WebApp SDK подписывает initData ключом бота, backend верифицирует HMAC-SHA256 с `secret_key = HMAC("WebAppData", BOT_TOKEN)`.

**B. Telegram Login Widget** (admin `/login`) — требует регистрации login_domain в @BotFather. Иначе виджет показывает `Bot domain invalid` и не загружается.

```text
В Telegram открыть @BotFather и выполнить:

  /setdomain
  → выбрать бот x10daily_bot (или ваше имя)
  → ввести домен admin без https://: например x10-admin-acct.vercel.app

  (Опц.) /setmenubutton — настроить главную кнопку для miniapp
  /newapp — зарегистрировать TG Mini App (создаст short URL вида t.me/x10daily_bot/app)
```

**Один login_domain на бот.** Для production используйте основной домен (`admin.x10.media`). Для preview/staging — отдельный test-бот (создаётся через `/newbot` в @BotFather), регистрируйте preview-URL в нём.

**Bot username для Vercel env**: `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` = имя без `@`. Должно совпадать с тем, что зарегистрировано через `/setdomain`.

---

## 7. Smoke tests checklist (после полного развёртывания)

Прогнать снизу-вверх. Каждая галочка — отдельный pass/fail.

### API layer

- [ ] `curl $API/health` → `{"status":"ok"}`
- [ ] `curl $API/v1/feed/daily?limit=10` → массив items с реальными slug'ами
- [ ] `curl $API/v1/articles/tsb-derzhit-stavku-17` → полный body + citations
- [ ] `curl $API/v1/community/klamps` → 10 клампов
- [ ] `curl $API/v1/events?scope=upcoming` → 2 события (без AI-вебинара из past)
- [ ] `curl $API/v1/digests/latest` → digest сегодняшней даты с 2 topArticleIds

### Auth-gated (с Authorization: Bearer <JWT> — HIGH-2)

Сначала получите JWT (любой из вариантов):

```bash
# Вариант A — реальный TG login (нужен валидный initData из TG WebView)
TOKEN=$(curl -s -X POST -H "Content-Type: application/json" \
  -d "{\"initData\":\"<raw-initData-querystring>\"}" $API/v1/auth/telegram | jq -r .token)

# Вариант B — dev-login (NODE_ENV !== production), для smoke-тестов
EDITOR_UUID=$(psql "$DIRECT_DATABASE_URL" -tAc "SELECT id FROM users WHERE role='editor' LIMIT 1")
TOKEN=$(curl -s -X POST -H "Content-Type: application/json" \
  -d "{\"userId\":\"$EDITOR_UUID\"}" $API/v1/auth/dev-login | jq -r .token)
```

- [ ] `curl -H "Authorization: Bearer $TOKEN" $API/v1/admin/queue` → массив (пустой, без ready)
- [ ] `curl -H "Authorization: Bearer $TOKEN" $API/v1/admin/pipeline-config` → 12 агентов
- [ ] `curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"kind":"fire"}' $API/v1/articles/<UUID>/reactions` → `{action:"added", userReacted:true}`
- [ ] Повторный POST того же endpoint → `{action:"removed"}` (toggle)
- [ ] `curl -H "Authorization: Bearer $TOKEN" $API/v1/auth/me` → `{user: {id, role, ...}}`
- [ ] Без header: `curl $API/v1/admin/queue` → 401 `Authorization Bearer required`

### Miniapp

- [ ] Открыть `https://x10-miniapp-<acct>.vercel.app/` — лента из 2 статей
- [ ] Кликнуть статью → reader открывается, hero image, body
- [ ] Кликнуть реакцию 🔥 — счётчик +1 мгновенно (optimistic), в БД row появится через ~500мс
- [ ] Прокрутить статью до конца — в Network видны POST'ы на `/article/...` (Server Actions reportProgress)

### Admin

- [ ] Открыть admin URL без cookie — middleware редиректит на `/login`
- [ ] На `/login` рендерится TG Login Widget (если `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` задан и домен зарегистрирован в @BotFather, см. §8.3)
- [ ] Войти через виджет под учёткой с role `editor` или `admin` → попадает на queue page
- [ ] Под учёткой `reader` (не редактор) → 403 "Недостаточно прав"
- [ ] После входа: demo-banner отсутствует
- [ ] `/pipeline-config` — 12 агентов с реальными config-чипами (если PUT уже делался)
- [ ] `/pipeline-config/factcheck` → изменить threshold с 0.85 на 0.9 → save → redirect → новое значение в чипе
- [ ] `/rubrics` → клик `taxes.news` → очередь фильтруется (пустая, но фильтр-чип отображается)
- [ ] `/authors` → 5 авторов из seed (Рыбаков с flagship-бейджом)

### Pipeline (без LLM, см. §10)

- [ ] Inngest dashboard → последний run от smoke test шага 5.5 виден (failed, no API key — ожидаемо)
- [ ] Cron functions зарегистрированы (но `cron` не настроен в wrangler.toml ещё — отдельная задача)

---

## 8. 152-ФЗ compliance — обязательно до prod-LLM-трафика

**Критически важно перед первым `wrangler secret put ANTHROPIC_API_KEY`.**

См. CLAUDE.md §7 для полного контекста.

### Чек-лист (НЕ запускайте LLM-агентов в prod без всех ✓):

- [ ] **Anthropic ZDR-контракт** подписан. Контакт: support@anthropic.com → "Zero Data Retention agreement for EU customers". Без него input/output логируются 30 дней → штраф ₽75K-₽700K за инцидент.
- [ ] **`ANTHROPIC_ZDR_CONFIRMED=true`** установлен через `wrangler secret put` для **обоих** workers (apps/api + apps/workers/pipeline). Без этого `loadEnv` в prod выбросит ошибку при наличии `ANTHROPIC_API_KEY` — boot fails. Это **enforced защита** от случайного prod-LLM-вызова до подписания ZDR (CRITICAL-6 из docs/SECURITY-AUDIT.md).
  ```bash
  cd apps/api && pnpm exec wrangler secret put ANTHROPIC_ZDR_CONFIRMED  # ввести: true
  cd apps/workers/pipeline && pnpm exec wrangler secret put ANTHROPIC_ZDR_CONFIRMED  # ввести: true
  ```
- [ ] **KikuAI Masker** развёрнут на Render.com (self-hosted Docker). См. skill `anthropic-skills:masker-pii-redaction`. URL + key → `MASKER_BASE_URL`/`MASKER_API_KEY` secrets в pipeline worker. **Enforced:** `loadEnv` требует обе переменные в prod (CRITICAL-5 уже закрыт в `packages/agents/src/masker.ts`).
- [ ] **Inngest signing key** установлен через `wrangler secret put INNGEST_SIGNING_KEY` в **pipeline worker**. Без него webhook принимает спуфнутые events (CRITICAL-4). `loadEnv` enforces в prod.
- [ ] **PostHog region:** EU (`https://eu.posthog.com`), не US. Проверить в дашборде PostHog.
- [ ] **Privacy policy** + согласия (`docs/strategy/` — ещё нужно подготовить, см. handoff session 9).
- [ ] **Resend domain** verified с EU-friendly SPF/DKIM.

### Архитектурное правило

Любой LLM-вызов в pipeline workers: **mask → LLM call → unmask на ответе**. См. реализацию в `packages/agents/src/agents/*` — все агенты используют helper `withMasker(...)`. `createMasker` в `packages/agents/src/masker.ts` **fail-closed** в prod — выбросит `MaskerUnconfiguredError` если `MASKER_BASE_URL`/`MASKER_API_KEY` пусты.

---

## 9. Troubleshooting

### `wrangler deploy` падает с `Authentication error`
`wrangler logout && wrangler login`. Сессия могла истечь.

### Migration падает с `relation already exists`
Drizzle-kit не идемпотентен. Скорее всего БД уже частично смигрирована. Опции:
- Проверить `_drizzle_migrations` таблицу — какие миграции применены.
- Если нужно с нуля: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` (только в dev!).

### `pnpm db:seed` падает с FK violation
Скорее всего миграции не применены. Запустить `pnpm --filter @x10/db db:migrate` сначала.

### CF Worker возвращает 522 / timeout
Hyperdrive не настроен → cold start Neon 300-500мс. Решения:
- (Quick) Smoke test несколько раз — после первого хита connection warm.
- (Right) Настроить Hyperdrive (см. закомментированный блок в [apps/api/wrangler.toml](apps/api/wrangler.toml)): `wrangler hyperdrive create x10-neon --connection-string $DATABASE_URL` → ID в config → раскомментировать binding → redeploy.

### Admin POST/PATCH/DELETE падает с 401
Session cookie истёк или невалиден. Залогиниться заново на `/login`. Проверить что user в БД:
```sql
SELECT id, role FROM users WHERE id = '<UUID>';
```

### TG Login Widget падает с "Bot domain invalid"
Домен admin не зарегистрирован в @BotFather. Команда боту: `/setdomain` → выбрать бот → ввести `https://x10-admin-<acct>.vercel.app` (без protocol для apex/subdomain). Только один login_domain на бот — для prod stage используйте основной домен, для preview — отдельный test-bot.

### Admin: cookie не сохраняется после login
SameSite/Secure conflict. Cookie ставится с `secure: true` в prod — должен подавать только через HTTPS. Vercel preview URLs работают, но локальный `http://localhost:3001` в prod build — нет. Используйте `pnpm dev` (NODE_ENV=development, secure: false).

### `X10_IMAGES is undefined` при upload
R2 binding не раскомментирован в [apps/api/wrangler.toml](apps/api/wrangler.toml) или bucket не создан. Вернуться к §3.

### Inngest discovery видит 0 функций
Worker может быть deployed, но не отвечает на `/inngest` GET. Проверить:
```bash
curl https://x10-worker-pipeline.<acct>.workers.dev/inngest
# Должен вернуть JSON с manifest функций.
```
Если 404 — `INNGEST_SIGNING_KEY` не задан → handler отключается.

---

## 10. Rollback / disaster recovery

### Откатить API deploy

```bash
pnpm --filter @x10/api exec wrangler deployments list
pnpm --filter @x10/api exec wrangler rollback <version-id>
```

### Откатить миграцию

Drizzle-kit не поддерживает auto-rollback. Опции:
- (Лучше) Создать новую миграцию-`down` руками: `pnpm --filter @x10/db db:generate` → отредактировать SQL → `db:migrate`.
- (Если катастрофа) Neon → Branches → создать branch from earlier timestamp → swap.

### Бэкап БД

Neon делает automatic point-in-time recovery до 7 дней на free-tier. Manual snapshot:
```bash
pg_dump "$DIRECT_DATABASE_URL" > backup-$(date +%Y%m%d).sql
```

### Если что-то совсем не так

1. Не паникуй — состояние БД в Neon переживёт любой downtime.
2. Откатить только API/worker через `wrangler rollback`.
3. Если данные побились — Neon branch с PITR (см. выше).
4. Прийти в этот документ за списком env'ов и шагов.

---

## 11. GitHub Actions setup

3 workflow'а в [.github/workflows/](../.github/workflows/) (добавлены session 12):

- **ci.yml** — на push/main + PR. 5 параллельных jobs: typecheck, lint (biome), test (apps/api исключён из-за vitest-pool-workers regression), build, audit (`--audit-level=high`).
- **security.yml** — на PR + weekly Mon 09:00 UTC. Dependency Review action блокирует PR с high+ severity deps, `pnpm audit --audit-level=moderate` для weekly inventory.
- **preview.yml** — на PR. Vercel preview deploys для miniapp + admin параллельно, posts URL в PR comment (обновляется на каждый push).

### Required GitHub secrets

Установить через GitHub UI (Settings → Secrets and variables → Actions) или CLI:

```bash
# Vercel preview deploys
gh secret set VERCEL_TOKEN              # https://vercel.com/account/tokens
gh secret set VERCEL_ORG_ID             # vercel link → выведет в .vercel/project.json
gh secret set VERCEL_PROJECT_ID_MINIAPP # из apps/miniapp/.vercel/project.json
gh secret set VERCEL_PROJECT_ID_ADMIN   # из apps/admin/.vercel/project.json
```

VERCEL_ORG_ID одинаков для обоих apps, PROJECT_ID — разный per app. После первого `pnpm dlx vercel link` в каждом app получаешь `.vercel/project.json` с обоими id.

### Что нужно настроить дополнительно

- **Branch protection rule** на `main`: Settings → Branches → Add rule → require status checks: `Typecheck`, `Lint (biome)`, `Test`, `Build`, `Audit (high+)`. Это блокирует force-merge сломанного кода.
- **Dependabot** для weekly dependency updates — опционально, может конфликтовать с pnpm-lock churn. Если включаем — `pnpm-lock.yaml` в `versioning-strategy: lockfile-only`.

### Что НЕ настроено (future scope)

- **CF Workers preview deploys** (api + pipeline) — отложено до Phase 2. Требует `CLOUDFLARE_API_TOKEN` + per-env wrangler.toml override. Текущий `pnpm build` (wrangler deploy --dry-run) ловит typecheck-проблемы на PR, что достаточно для MVP.
- **Lighthouse CI** — для метрологических бюджетов из CLAUDE.md §2. Требует deployed URL → запускать после preview.yml через workflow_run trigger.

---

## 12. Что ещё не описано (future scope)

- **Cron triggers в Inngest** — daily ingest 06:00 МСК, newsletter 06:00 МСК, weekly score Mon 09:00 МСК. Сейчас функции зарегистрированы, но без `cron` triggers в wrangler.toml.
- **Hyperdrive** — закомментирован в [apps/api/wrangler.toml](apps/api/wrangler.toml), включить когда нагрузка вырастет.
- **Sentry sourcemaps** — отдельная задача.
- **CDN / Cloudflare Images variants** — пока R2 отдаёт original.

---

## Версия

**v1.1 · 28 мая 2026** · session 12 handoff. Добавлены: HIGH-2 (Telegram session auth, session 11), GitHub Actions (session 12).

Обновлять при изменении wrangler.toml structure, добавлении новых workers/секретов, миграциях.
