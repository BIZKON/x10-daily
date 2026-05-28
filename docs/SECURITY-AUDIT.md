# X10 Daily — Security Audit

**Дата аудита:** 27 мая 2026
**Метод:** 4 параллельных AI-аудита по измерениям (auth/IDOR, input validation, secrets/supply-chain, DoS/CORS/LLM).
**HEAD на момент аудита:** `40379db` (после Session 10 + Deploy guide).
**Покрытие:** статический анализ кода. **НЕ покрывает:** penetration testing на live deploy, performance load testing, mobile threats (TG/MAX SDK), Anthropic-side risks.

---

## Executive summary

Кодовая база **не готова к production-deploy в текущем виде**. Главная проблема — auth-stub `X-User-Id` распространяется на всё: admin CRUD, publish, pipeline-run и engagement endpoints не проверяют ни сессию, ни роль. Любой клиент с CF Workers URL может:

- Публиковать draft-статьи (`POST /v1/admin/publish/:id` вообще без auth).
- Удалять авторов / события / digest'ы.
- Выключать pipeline через `PUT /v1/admin/pipeline-config/draft {enabled:false}`.
- Жечь Anthropic budget через `POST /v1/pipeline/run` без rate limit.
- Подделывать engagement (reactions/bookmarks/progress) за любого user'a.

Это известный гэп (см. `auth.ts:11` "В prod без auth-middleware НЕ деплоим") — но **blast radius шире чем казалось**: 6 critical + 8 high. Плюс **3 152-ФЗ-блокера** до первого production LLM-вызова (ZDR, Masker, Inngest webhook signing).

**Хорошие новости:** SQL injection защищён (Drizzle параметризация), path traversal в R2 закрыт UUID-валидацией, supply chain чистый (нет postinstall scripts), secrets не закоммичены в git history.

---

## Прогресс по фиксам

Отмечайте `[x]` по мере закрытия. Каждый фикс должен сопровождаться коммитом со ссылкой на ID финдинга (`fix(security): C1 — auth on /v1/admin/publish/:id`).

### CRITICAL — must-fix до любого production deploy

- [x] **C1** · `apps/api/src/routes/admin.ts:118-155` — `POST /v1/admin/publish/:id` БЕЗ auth вообще
  - **Атака:** `curl -X POST $API/v1/admin/publish/<uuid>` → любой draft переходит в published
  - **Fix:** ✅ closed — `await requireRole(c, db, EDITOR_ROLES)` на всех 3 handlers (queue/article/publish)

- [x] **C2** · `apps/api/src/routes/pipeline.ts:32-56` — `POST /v1/pipeline/run` без auth/rate limit
  - **Атака:** loop с произвольным topic+context → сжигаемая Anthropic budget ($0.45/article × ∞)
  - **Fix:** ✅ closed (auth+role); rate limit отложен на HIGH-3

- [x] **C3** · `apps/api/src/routes/admin-content.ts:217-507` — `extractUserId` есть, **role check отсутствует**
  - **Атака:** любой reader с валидным UUID может DELETE author / PUT pipeline-config
  - **Fix:** ✅ closed — `requireRole(c, db, EDITOR_ROLES)` на всех 16 handlers (CRUD + pipeline-config + upload)

- [x] **C4** · `apps/workers/pipeline/src/index.ts:26-41` — Inngest webhook без явной verification signing-key
  - **Атака:** спуфнутый POST на `/inngest` → unlimited pipeline runs → unlimited LLM spend
  - **Fix:** ✅ closed — `getPipelineEnv` через `loadEnv` enforces `INNGEST_SIGNING_KEY` в prod (productionRequired list). `createPipelineInngest` уже передавал `signingKey`/`isDev:false` — теперь подтверждено fail-fast на boot

- [x] **C5** · `packages/agents/src/masker.ts` — Masker fail-open
  - **Атака:** при пустом `MASKER_BASE_URL` сырые ПДн уходят в Anthropic logs
  - **Fix:** ✅ **уже было закрыто** в `masker.ts:91-93` — `createMasker` throws `MaskerUnconfiguredError` если `NODE_ENV='production' && !MASKER_BASE_URL`. Аудит-агент 3 ошибся, не прочитав реализацию. Также `loadEnv` enforces `MASKER_BASE_URL`/`MASKER_API_KEY` в productionRequired

- [x] **C6** · `packages/config/src/env.ts` — ZDR-контракт не проверяется на boot
  - **Атака:** первый LLM-вызов отправит данные в 30-day retention → штраф ₽75K-₽700K (152-ФЗ ст.272.1)
  - **Fix:** ✅ closed — добавлен `ANTHROPIC_ZDR_CONFIRMED` enum в schema + boot check в `loadEnv`: если `NODE_ENV='production' && ANTHROPIC_API_KEY && ZDR !== "true"` → throw. Документировано в DEPLOY.md §8.

### HIGH — до open beta

- [x] **H1** · `apps/api/src/app.ts` — CORS `origin: (origin) => origin ?? "*"` + `credentials:true`
  - **Fix:** ✅ closed — `buildCorsOrigin(bindings)` парсит `X10_ALLOWED_ORIGINS` env (comma-separated, wildcards `https://*.vercel.app`). В prod без env — closed-by-default. В dev — permissive для localhost.

- [x] **H2** · `apps/api/src/auth.ts:15-27` — X-User-Id это просто UUID без подписи
  - **Fix:** ✅ closed (session 11) — full Telegram session auth.
    - Backend: `apps/api/src/lib/initdata.ts` (Mini App, HMAC через `WebAppData` secret) + `telegram-widget.ts` (admin Login Widget, SHA256 secret) + `jwt.ts` (jose HS256). `POST /v1/auth/telegram` upserts user + signJWT; `POST /v1/auth/telegram-widget` role-gates editor|admin. `extractSession` / `requireRole` теперь читают Authorization Bearer, всё `extractUserId` удалено.
    - Miniapp: `TelegramProvider` авто-логинит через `window.Telegram.WebApp.initData` → Server Action → HttpOnly cookie `x10_session`. `fetchAuthed`/`postAuthed` → Bearer.
    - Admin: `/login` page с TG Login Widget (`telegram-widget.js` script, `data-onauth` callback). `middleware.ts` redirect на `/login` если cookie нет. Demo mode bypass.
    - Dev escape: `POST /v1/auth/dev-login` (NODE_ENV !== production) принимает userId → JWT. Server Action в miniapp/admin использует `X10_DEV_USER_ID` / `X10_ADMIN_USER_ID` для local dev без TG WebView.
    - Env: `TELEGRAM_BOT_TOKEN` + `X10_JWT_SECRET` (min 32 байта) + `X10_JWT_TTL_SECONDS` (default 86400) добавлены в productionRequired.
    - X-User-Id удалён из CORS allowHeaders.

- [x] **H3** · `apps/api/src/routes/engagement.ts` + `pipeline.ts` — Нет rate limit
  - **Fix:** ✅ closed — CF Workers Rate Limit binding (`ENGAGEMENT_LIMITER` 30/мин, `PIPELINE_LIMITER` 10/мин). `applyRateLimit(c, limiter, scope, userId)` helper в `apps/api/src/rate-limit.ts`. Ключ = `scope:userId:IP`.

- [x] **H4** · `packages/agents/src/agents/ingest.ts` — Prompt injection через RSS rawTitle/rawText
  - **Fix:** ✅ closed — кастомный `formatInput` оборачивает `rawTitle`/`rawText` в `<UNTRUSTED_SOURCE>` XML-tags. System prompt предупреждает о возможной injection. Plus `superRefine` на outputSchema проверяет topic/context на 6 instruction-patterns (`system:`, `ignore previous`, etc.) — false → Zod parse fails → defineAgent throw.

- [x] **H5** · `apps/admin/src/lib/api.ts` + `apps/miniapp/src/lib/api.ts` — demo mode silent в prod
  - **Fix:** ✅ closed — `getBaseUrl()` throws в prod если `X10_API_BASE_URL` пустой и `X10_DEMO !== "1"`. Явный escape-hatch `X10_DEMO=1` для preview-deploys.

- [x] **H6** · `apps/api/src/routes/articles.ts` — `isPaid` paywall enforcement
  - **Fix:** ✅ closed — `hasPaidSubscription(db, userId)` JOIN на `subscriptions` (status='active' + tier IN paid/premium). `stripPaidContent(row, hasAccess)` strip'ит body/citations/audioUrl + добавляет `paywalled: true` flag. Тизер (tease/lede/whyItMatters) остаётся для рендера превью.

- [ ] **H7** · `apps/api/src/routes/upload.ts:24` — Нет per-user upload quota
  - **Fix:** требует либо CF KV для счётчиков, либо новой таблицы `uploads_log` (миграция 0004). Отложено — отдельный коммит с инфра-изменением.

- [x] **H8** · `apps/api/src/app.ts` — `onError` возвращает `err.message` verbatim
  - **Fix:** ✅ closed — `HTTPException` пропускается (controlled message). Остальные → generic `{error:"internal"}` в prod, full err в `console.error` (CF dashboard logs / Sentry потом). В dev оставлен `message` для удобства отладки.

### MEDIUM — backlog

- [x] **M1** · `articles.ts:7` — slug param Zod validation. ✅ closed в HIGH commit (вместе с paywall): `z.string().min(1).max(200).regex(/^[a-z0-9-]+$/)`.
- [x] **M2** · `upload.ts` — MIME spoofing. ✅ closed: `detectFormat()` читает первые 16 байт и проверяет magic bytes для PNG/JPEG/GIF/WEBP. Mismatch с заявленным Content-Type → 415.
- [x] **M3** · `upload.ts` — SVG XSS. ✅ closed: `image/svg+xml` удалён из `ALLOWED_MIME`. Если потребуется — sandboxed subdomain с CSP в будущем.
- [x] **M4** · `draft-article.ts` — cost-runaway. ✅ closed: `rateLimit: {limit: 50, period: "1h"}` в Inngest function config. Потолок ~$22.50/час даже при auth bypass. Полное daily $ accounting — отдельная задача (метрика, не security).
- [x] **M5** · `upload.ts` — 5MB cap после буферизации. ✅ closed: pre-check `Content-Length` header (6 MB cap, multipart overhead+) до `c.req.formData()`. Раннее 413 без bandwidth abuse.
- [x] **M6** · `engagement.ts` — reactions на draft статьи. ✅ closed: `eq(articles.status, "published")` добавлен в existence check для reactions, bookmark, progress.
- [x] **M7** · `pipeline_config.agent` — нет unique index. ✅ closed: migration 0004 + `uniqueIndex` в schema. PUT handler упрощён на single `INSERT ... ON CONFLICT DO UPDATE` (atomic). Заодно исправлен `_journal.json` — entries для 0001-0003 были потеряны, без них `db:migrate` пропускал бы их.
- [x] **M8** · Нет Hono `bodyLimit()` middleware. ✅ closed: `bodyLimit({maxSize: 1MB})` global, override 6MB для `/v1/admin/upload`. JSON DoS закрыт.
- [x] **M9** · `engagement.ts` toggle race. ✅ closed: `.onConflictDoNothing()` на INSERT branch — concurrent racer получает no-op вместо PK violation, оба клиента видят корректную "added" (row exists). Без транзакции (neon-http one-shot), но PK constraint обеспечивает консистентность.

### LOW / informational

- [ ] **L1** · `auth.ts:13` — UUID v1 принимается (leak MAC+timestamp если когда-нибудь сгенерируете server-side). Assert v4/v7
- [ ] **L2** · `upload.ts:106` — `originalName` в R2 customMetadata без sanitize → XSS risk если рендерится в admin
- [ ] **L3** · `wrangler.toml [vars]` — нет CI lint защиты от случайного добавления secrets туда. Add: GH Actions check rejecting `wrangler.toml` containing `DATABASE_URL|ANTHROPIC|MASKER|INNGEST|TOKEN|KEY` in `[vars]`
- [ ] **L4** · `.gitignore` пропускает `.env.staging`, `.env.preview`, `.env.ci`, `.dev.vars.local`. Add: `.env.*` broad pattern
- [ ] **L5** · `.env.example:30` — `CLOUDFLARE_API_TOKEN` placeholder invite to accumulate. Drop — держать в CI secrets/shell rc
- [ ] **L6** · `source.url` в `process-source-item.ts:65` без `https://` allowlist → `javascript:` URL мог бы попасть в published article. Fix: `z.string().url().refine(u => u.startsWith('https://'))` в sourceRefSchema
- [ ] **L7** · LLM responses через `console.error` → CF dashboard logs (retention per CF policy). Post-unmask PII утечёт. Fix: Sentry `beforeSend` strip полей `text|body|context|topic`
- [ ] **L8** · FactCheckAgent (Opus $5/$25) не дедуплицирует по hash(topic+sources) → повторы жгут $$. Fix: deduplication step в workflow
- [ ] **L9** · `pipeline.ts:21-30` — Inngest cached client (module-level singleton) может закешировать первый env. Минор риск. Fix: key cache by `env.NODE_ENV`
- [x] **L10** · `pnpm audit --prod` не запускался в CI — ✅ closed (session 12). `audit` job в `.github/workflows/ci.yml` с `--audit-level=high` блокирует PR; `pnpm audit --audit-level=moderate` weekly в `.github/workflows/security.yml`. Заодно `pnpm overrides` зафиксировал `valibot>=1.2.0` для закрытия GHSA-vqpr-j7v3-hqw9 (ReDoS, через `@telegram-apps/sdk-react>valibot`).

---

## Что проверено и чисто

✅ **SQL injection** — Drizzle ORM защищает параметризацией. `sql\`\`` template literals использованы только с column refs (`EXCLUDED.read_percent`, `GREATEST(...)`), без user-data interpolation.
✅ **Path traversal в R2 upload** — `extractUserId` валидирует UUID через Zod `.uuid()`, traversal blocked.
✅ **Next.js Server Actions** — встроенный origin check с Next 14+. Подтвердить что `next.config` не override через `experimental.serverActions.allowedOrigins`.
✅ **Secrets in git history** — clean. Только placeholder `sk-ant-...` в handoff session 9 (без body).
✅ **Postinstall scripts** — отсутствуют в собственных package.json. Supply chain attack vector со стороны проекта закрыт.
✅ **`X10_DEV_USER_ID` / `X10_ADMIN_USER_ID`** — корректно server-only (нет `NEXT_PUBLIC_` префикса, usage только в server modules).
✅ **pnpm-lock.yaml** — v9 с modern integrity hashes.
✅ **`profile.ts`** — корректно фильтрует по userId из header (не из URL) → IDOR закрыт.

---

## Рекомендованный план действий

### Перед любым production deploy (1-2 сессии работы)

Приоритет — сначала закрыть all CRITICAL одной auth-middleware пачкой, потом 152-ФЗ блокеры:

1. **Auth middleware** — `requireSession(c)` + `requireRole(level)` поверх Hono. Closes **C1, C2, C3** одной правкой. ~30-40 lines.
2. **Inngest signing key** verification (**C4**) — 10 lines в `apps/workers/pipeline/src/index.ts`.
3. **Masker fail-closed** (**C5**) — assert env + throw в `createMasker`. 5 lines.
4. **ZDR boot check** (**C6**) — `apps/api/src/env.ts` + `apps/workers/pipeline/src/env.ts`. 5 lines × 2.
5. **CF RateLimiter** binding для engagement + pipeline-run (**H3**, **M4**) — wrangler config + middleware.
6. **CORS allowlist** (**H1**) — простая правка `app.ts`.
7. **onError sanitize** (**H8**) — простая правка `app.ts`.
8. **Demo mode hard-fail** в prod (**H5**) — `getBaseUrl()` + аналог в miniapp.
9. **SVG drop из upload allowlist** + `Content-Length` pre-check (**M2**, **M3**, **M5**).

### До open beta (1 сессия)

- ✅ **H2** Telegram initData auth + JWT sessions — закрыт session 11 (см. выше).
- ✅ **H4** Prompt-injection wrapper для IngestAgent — закрыт.
- ✅ **H6** Paywall enforcement для `isPaid` — закрыт.
- [ ] **H7** Upload quota — открыт.

### Backlog (по мере роста)

- Migration 0004: unique index на `pipeline_config.agent` (**M7**), уже в handoff.
- pnpm audit в CI (**L10**).
- FactCheck dedup (**L8**).
- LLM logging strip (**L7**).
- Wrangler vars/secrets CI lint (**L3**).
- `.env.*` broad gitignore (**L4**).

---

## Версия

**v1.0 · 27 мая 2026** · session 10 audit.

Ре-аудит запланировать:
- После закрытия всех CRITICAL.
- После Telegram session auth (закрытие H2).
- Перед open beta.
- Перед расширением на новые регионы (KZ/AE — additional compliance).

При закрытии финдинга — обновить чекбокс `- [x]` + ссылка на коммит в комментарии. При обнаружении нового — добавить с суффиксом версии (e.g. `C7-v2`).
