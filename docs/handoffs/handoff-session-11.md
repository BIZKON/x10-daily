# Handoff · Session 11

**Дата:** 28 мая 2026
**Что закрыто:** HIGH-2 целиком — реальный Telegram session auth заменяет временный X-User-Id header. Закрывает последний high-severity gap для public-facing surface (miniapp) и для editorial (admin).
**Репозиторий:** https://github.com/BIZKON/x10-daily

---

## Git коммиты сессии (7)

```
87f1956  fix(miniapp): suppressHydrationWarning на html (TG SDK инжектит viewport CSS vars)
1478919  feat(admin): Telegram Login Widget + middleware role guard (HIGH-2)
0371138  feat(miniapp): Telegram session auth wiring (HIGH-2)
dfd2bdf  refactor(api): миграция всех routes с X-User-Id на Bearer JWT (HIGH-2)
642b9c0  feat(api): /v1/auth/* endpoints — Telegram session issuance (HIGH-2)
e09e7a2  feat(api): Telegram initData + Login Widget + JWT crypto modules (HIGH-2)
4b6e902  feat(config): TELEGRAM_BOT_TOKEN + X10_JWT_SECRET + JWT_TTL env vars (HIGH-2)
```

Каждый коммит — typecheck clean, атомарный, обратимый.

---

## Что закрыто за сессию

### 1. Env vars + bindings (commit 4b6e902)

`packages/config/src/env.ts` расширен:
- `TELEGRAM_BOT_TOKEN` — regex `<id>:<secret>`, productionRequired
- `X10_JWT_SECRET` — min 32 байта, productionRequired
- `X10_JWT_TTL_SECONDS` — coerce.number, default 86400 (24h)

`apps/api/worker-configuration.d.ts` + `apps/api/src/env.ts` пробрасывают новые vars. `.env.example` + `wrangler.toml` документированы.

**Без `TELEGRAM_BOT_TOKEN` и `X10_JWT_SECRET` в prod `loadEnv` падает на boot** — by design, без auth не запускаемся.

### 2. Crypto modules (commit e09e7a2)

`apps/api/src/lib/`:
- **initdata.ts** — Mini App verification. Спека Telegram:
  - `secret_key = HMAC_SHA256("WebAppData", BOT_TOKEN)`
  - `data_check_string` — отсортированные пары без `hash`/`signature`, склеенные через `\n`
  - `expected = HMAC_SHA256(secret_key, data_check_string)` hex
  - Constant-time compare + `auth_date` freshness check (≤24h)
- **telegram-widget.ts** — Login Widget verification. Отличия от Mini App:
  - `secret_key = SHA256(BOT_TOKEN)` (не HMAC, а просто SHA256)
  - Payload — плоский объект, не querystring
  - Тот же HMAC-SHA256 compare + freshness
- **jwt.ts** — `signSession(claims, opts)` / `verifySession(token, opts)` через jose HS256. Claims: `sub` (UUID), `role`, `iat`, `exp`.

`apps/api/test/auth-crypto.test.ts` — 13 unit-тестов (happy/sad paths). Не запускаются сейчас из-за пре-сломанного `@cloudflare/vitest-pool-workers` (см. handoff session 10), но не требуют CF-окружения — побегут когда раннер починят.

**Dependency:** `jose@^6` добавлен в `apps/api/package.json`.

### 3. Auth routes (commit 642b9c0)

`apps/api/src/routes/auth.ts` + register в `app.ts`:
- **POST /v1/auth/telegram** — Mini App initData → upsert user (platform="telegram", platformUserId, role="reader" для нового) → JWT.
- **POST /v1/auth/telegram-widget** — Login Widget payload → lookup existing user → **role-gate** (editor|admin иначе 403) → JWT. **Первый admin создаётся вручную через `pnpm db:seed`** или ручной INSERT.
- **GET /v1/auth/me** — Bearer → return fresh user info из БД.
- **POST /v1/auth/dev-login** (NODE_ENV !== production) — body `{userId}` → JWT. Для local dev без TG WebView. В prod возвращает 404.

Rate-limited через `ENGAGEMENT_LIMITER` (30/мин per IP). 503 если `TELEGRAM_BOT_TOKEN` / `X10_JWT_SECRET` не заданы.

### 4. Auth refactor + миграция callsites (commit dfd2bdf)

`apps/api/src/auth.ts` переписан полностью:
- Удалены `extractUserId` / `tryExtractUserId` (header-based MVP-stub)
- Добавлены `extractSession` / `tryExtractSession` (Authorization Bearer → verify JWT)
- `requireRole(c, db, allowed)` — публичный интерфейс сохранён. Внутри теперь использует `extractSession` + DB lookup users.role для freshness (revocation case: admin demoted → старый JWT отзывается через 401).

Мигрированы все callsites:
- `engagement.ts` (3 endpoints) — `extractSession`/`tryExtractSession`
- `articles.ts` — `tryExtractSession` (paywall check)
- `profile.ts` (3 endpoints) — `extractSession`
- `admin.ts`/`admin-content.ts`/`pipeline.ts`/`upload.ts` — работают без правок (используют только `requireRole`, чей публичный интерфейс не поменялся)

`X-User-Id` удалён из CORS `allowHeaders` в `app.ts`. Комментарии актуализированы по всем routes.

### 5. Miniapp wiring (commit 0371138)

`apps/miniapp/src/`:
- **lib/session.ts** — `getSessionToken` / `setSessionToken` / `clearSessionToken` через `cookies()`. HttpOnly + Secure (prod) + SameSite=Lax + path=/. Cookie name: `x10_session`.
- **lib/auth-actions.ts** ("use server"):
  - `loginWithTelegramAction(initData)` — POST `/v1/auth/telegram` → cookie
  - `devLoginAction()` — fallback для localhost (NODE_ENV !== prod + X10_DEV_USER_ID) → POST `/v1/auth/dev-login` → cookie
  - `logoutAction()` — clear cookie
- **components/telegram-provider.tsx** (client) — при маунте читает `window.Telegram.WebApp.initData`. Если есть — `loginWithTelegramAction`. Иначе fallback на `devLoginAction`. `router.refresh()` после успеха. `ref`-guard от Strict Mode дублей.
- **app/layout.tsx** — `<Script src="https://telegram.org/js/telegram-web-app.js?56" strategy="beforeInteractive">` + `<TelegramProvider>` wrap. `suppressHydrationWarning` на `<html>` — SDK инжектит `--tg-viewport-height` CSS-переменные после SSR (commit 87f1956).
- **lib/api.ts** — `fetchAuthed`/`postAuthed` теперь читают token через `getSessionToken()` и шлют `Authorization: Bearer`. `getDevUserId` и его call-sites удалены.
- **lib/engagement-actions.ts** — `classifyFailure` через cookie presence.

### 6. Admin wiring (commit 1478919)

`apps/admin/src/`:
- **lib/session.ts** + **lib/auth-actions.ts** — same pattern что в miniapp, но логин через `loginWithTelegramWidgetAction(widgetUser)` → POST `/v1/auth/telegram-widget`.
- **middleware.ts** — Next.js middleware на `/((?!_next/static|_next/image|favicon.ico|api/).*)`. Без cookie → redirect `/login?next=<path>`. **Demo mode** (no `X10_API_BASE_URL` + non-prod) пропускает.
- **components/tg-login-widget.tsx** (client) — рендерит `telegram-widget.js` script с `data-onauth` callback. Callback вызывает Server Action. UI handles: `forbidden` (403, не editor/admin) / `tg_invalid` (401) / `no_backend` / `network`.
- **app/login/page.tsx** — точка входа. TG Widget когда `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` задан, fallback на dev form (NODE_ENV !== prod + `X10_ADMIN_USER_ID`). Auto-redirect если cookie уже есть.
- **lib/api.ts** — `adminMutate` через `getSessionToken` + Bearer. `getAdminUserId` удалён.
- **app/upload-action.ts** — то же.

`.env.example` дополнен `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (public env, рендерится в браузер для виджета).

### 7. Documentation (этот handoff + DEPLOY.md + SECURITY-AUDIT.md)

- **docs/DEPLOY.md**:
  - §4.1 — новые `wrangler secret put` команды: `TELEGRAM_BOT_TOKEN`, `X10_JWT_SECRET`, `X10_ALLOWED_ORIGINS`
  - §4.3 — smoke test обновлён: Authorization Bearer вместо X-User-Id
  - §6.2/6.3 — Vercel env: `X10_DEV_USER_ID`/`X10_ADMIN_USER_ID` больше не нужны (auth идёт через initData/Widget). `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` для admin.
  - §6.4 — **новый раздел**: @BotFather setup для Telegram session auth (Mini App vs Login Widget, `/setdomain`, один login_domain на бот, prod vs preview-bot)
  - §7 — smoke-test чек-лист обновлён: получение JWT через `/v1/auth/telegram` или `/v1/auth/dev-login`, admin login flow через TG Widget
  - §9 — troubleshooting: TG Widget "Bot domain invalid", cookie не сохраняется (SameSite/Secure)
- **docs/SECURITY-AUDIT.md** — H2 переключен на `[x]` с детальным описанием закрытия.

---

## Security posture после сессии

```
CRITICAL: 6/6 ✅
HIGH:     8/9 (H7 upload quota остался)
MEDIUM:   9/9 ✅
LOW:      0/10 (informational, backlog)
Total:    23/25 (92%) — up from 22/25 (88%)
```

Remaining HIGH: **H7 upload quota** — нужна CF KV для счётчиков или таблица `uploads_log` (migration 0005).
Remaining LOW: L1-L10 informational, в backlog.

**Все блокеры prod-deploy закрыты для public-facing surface.**

---

## Что работает (проверено)

### Typecheck

```bash
pnpm typecheck
# Tasks: 9 successful, 9 total (FULL TURBO)
```

Все 9 пакетов компилируются: config, ui, voice, db, agents, miniapp, admin, worker-pipeline, api.

### Preview servers (in demo mode, X10_API_BASE_URL не задан)

- `miniapp` на :3000 — главная страница рендерит ленту (mock), hydration warning починен через `suppressHydrationWarning`.
- `admin` на :3001 — queue page с mock-fixtures, demo banner показан, /login page показывает fallback ("Telegram Login Widget не настроен — задайте NEXT_PUBLIC_TELEGRAM_BOT_USERNAME").

PPR-warnings про `await searchParams` outside Suspense — pre-existing, не связаны с auth изменениями, не блокируют render.

### Что не проверено (требует реальный deploy)

- Действительный TG initData (нужен @BotFather bot + Mini App URL)
- Login Widget на admin (нужен login_domain в @BotFather)
- Cross-origin cookie behavior (нужен real prod-домен)
- JWT verification end-to-end (требует apps/api запущенный с `wrangler dev` + secrets)

Эти проверки происходят в **Фаза 2 — deploy реальный стек** (DEPLOY.md).

---

## Delta из session 10

| Слой | Session 10 | Session 11 |
|---|---|---|
| API routes | 13 | **14** (+ `/v1/auth/*` — 4 endpoints: telegram / telegram-widget / me / dev-login) |
| apps/api/src/lib/ | — | **3 модуля**: initdata.ts (143 lines) · telegram-widget.ts (137 lines) · jwt.ts (74 lines) |
| Crypto unit tests | — | **13 тестов** (initData × 6, widget × 4, JWT × 3) |
| auth.ts | extractUserId/tryExtractUserId (header) | **extractSession/tryExtractSession** (Bearer). +DB freshness check в requireRole |
| Miniapp Server Actions | engagement (3) | + **auth-actions** (loginWithTelegram, devLogin, logout) |
| Miniapp client components | 3 | **4** (+ TelegramProvider) |
| Admin pages | 10 | **11** (+ `/login`) |
| Admin Server Actions | content (5) | + **auth-actions** (loginWithTelegramWidget, devLogin, logout) |
| Admin middleware | — | **+1** (auth guard, demo mode bypass) |
| Env переменные prod | base + ZDR + ALLOWED_ORIGINS + DEMO | + **TELEGRAM_BOT_TOKEN** + **X10_JWT_SECRET** + X10_JWT_TTL_SECONDS + NEXT_PUBLIC_TELEGRAM_BOT_USERNAME |
| Production guards | ZDR + Masker | + TG_BOT_TOKEN + JWT_SECRET (loadEnv fails on boot без них) |
| Dependencies | base | + **jose@^6** (apps/api) |
| Security closed | 22/25 (88%) | **23/25 (92%)** |

---

## Не работает / нужно для prod

Изменилось из session 10 (✓ = закрыто в эту сессию):

1. ✓ ~~HIGH-2 Telegram session auth~~ — закрыт целиком.
2. **БД не развёрнута** — Neon Frankfurt не создан, миграции 0000-0004 не применены.
3. **apps/api worker** не задеплоен — `wrangler deploy` ни разу.
4. **R2 bucket** не создан.
5. **Anthropic ZDR контракт** не подписан → enforced через `ANTHROPIC_ZDR_CONFIRMED`.
6. **KikuAI Masker** не задеплоен на Render.
7. **Inngest cloud** — `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` не настроены.
8. **@BotFather setup** — bot не создан, login_domain не зарегистрирован, Mini App URL не привязан. См. DEPLOY.md §6.4.
9. **HIGH-7 upload quota** — остался открытым.
10. **Cron-функции** — daily ingest 06:00 МСК, newsletter 06:00 МСК, weekly score — Inngest cron не настроен.
11. **PostHog fetcher** для подачи engagement-данных в ScoreWeeklyAgent.
12. **CI/CD** не настроен.
13. **vitest-pool-workers** регрессия — раннер apps/api не запускается из-за несовместимости с vitest 4.x.
14. **L1-L10 informational** best-practices — в backlog.
15. **Sidebar на /login admin** — minor UX issue (sidebar показывается, но клики redirect через middleware). Phase 2 cleanup через route group `(auth)`.

---

## Что дальше

### Приоритет A: prod-готовность

- **Фаза 2 — реальный стек** (теперь безопасно после HIGH-2). Neon Frankfurt + миграции + wrangler deploy + R2 + Inngest cloud + @BotFather setup. См. DEPLOY.md.
- **CI/CD** — GitHub Actions: typecheck + tests + lint + preview-deploy на PR + `pnpm audit` gate (LOW-10).

### Приоритет B: оставшиеся security findings

- **HIGH-7 Upload quota** — таблица `uploads_log` (migration 0005) с per-user счётчиками за last 24h. Cap 100 файлов/день, 500 MB total. Локальное, без архитектурных рисков.
- **LOW batch (L1-L10)** — все informational best-practices в один pass.

### Приоритет C: внешние интеграции

- **AudioAgent через ElevenLabs WS-proxy на Render** — skill `anthropic-skills:elevenlabs-voice-agent-russia` готов как guide.
- **Resend** для actual newsletter sending (`apps/workers/newsletter`).
- **VisualAgent** — Gemini 2.5 Flash через proxy для инфографики.
- **MAX OAuth** — отдельный provider в схеме `users.platform` уже есть, нужна реализация login flow.

---

## Стартовый промпт для следующей сессии

> Прочитай `docs/handoffs/handoff-session-11.md` целиком — он самый свежий и переопределяет более ранние. Если security-аспекты — `docs/SECURITY-AUDIT.md`. Если deploy — `docs/DEPLOY.md`. Подтверди typecheck clean: `pnpm typecheck`. Я хочу [выбери: Фаза 2 — поднять реальный стек (Neon + wrangler + R2 + Inngest cloud, см. DEPLOY.md) / Upload quota миграция 0005 (HIGH-7) / CI/CD GitHub Actions / AudioAgent через ElevenLabs / Resend newsletter / LOW batch (10 informational findings) / MAX OAuth provider]. Покажи план перед действиями.
