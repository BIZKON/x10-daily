# Handoff · Session 12

**Дата:** 28 мая 2026
**Что закрыто:** GitHub Actions CI/CD pipeline — 3 workflow'а (ci/security/preview). LOW-10 (pnpm audit gate) — closed. Закрывает один из главных гэпов "Не работает" из handoff session 10.
**Репозиторий:** https://github.com/BIZKON/x10-daily

---

## Git коммиты сессии (3)

```
4ca326c  ci(github): Vercel preview deploys для miniapp + admin на PR
7b46c74  ci(github): security workflow — dependency review + weekly moderate audit
45b692d  ci(github): CI workflow — typecheck + lint + test + build + audit
```

Каждый коммит — typecheck clean, атомарный.

---

## Что закрыто

### 1. CI workflow (commit 45b692d)

[.github/workflows/ci.yml](../../.github/workflows/ci.yml) — на push/main + PR. **5 параллельных jobs:**

| Job | Команда | Что ловит |
|---|---|---|
| Typecheck | `pnpm typecheck` (turbo + scripts/seed.ts) | TS errors, no `any` без обоснования |
| Lint (biome) | `pnpm exec biome ci .` | formatter + linter rules |
| Test | `pnpm turbo run test --filter='!@x10/api'` | vitest tests (apps/api исключён — vitest-pool-workers regression) |
| Build | `pnpm build` | Next build errors + wrangler dry-run для api/pipeline |
| Audit (high+) | `pnpm audit --prod --audit-level=high` | known high/critical CVEs (LOW-10 closed) |

`concurrency` cancels stale runs того же PR — экономия CI-минут на быстрых force-push.

**Bonus**: `pnpm overrides` для `valibot>=1.2.0` в root package.json закрывает GHSA-vqpr-j7v3-hqw9 (ReDoS в EMOJI_REGEX через transitive `@telegram-apps/sdk-react>valibot`). Без override audit job падал на старте.

### 2. Security workflow (commit 7b46c74)

[.github/workflows/security.yml](../../.github/workflows/security.yml) — на PR + weekly Mon 09:00 UTC + manual dispatch.

| Job | Когда | Что делает |
|---|---|---|
| Dependency Review | PR | [actions/dependency-review-action@v4](https://github.com/actions/dependency-review-action) блокирует PR при добавлении deps с high+ vulns, comment-summary at on-failure |
| Audit (moderate+) | PR + weekly cron | `pnpm audit --audit-level=moderate` — stricter чем CI gate, для инвентаризации moderate vulns без блокировки |

Weekly cron даёт прозрачность по transitive deps; PR-gate блокирует только реально критичное.

### 3. Preview workflow (commit 4ca326c)

[.github/workflows/preview.yml](../../.github/workflows/preview.yml) — на PR. **2 параллельных job'а:**

- **miniapp**: `vercel pull` → `vercel build` → `vercel deploy --prebuilt` → PR comment с URL
- **admin**: то же для `apps/admin`

PR comments обновляются на каждый push (через marker `<!-- preview-miniapp -->` / `<!-- preview-admin -->`), не плодя дубли.

Concurrency cancels stale runs PR. Без настроенных secrets workflow упадёт на `vercel pull` — visible в PR check, можно отключить через GitHub UI.

### 4. Документация (включена в этот handoff)

- [docs/DEPLOY.md §11](../DEPLOY.md) — раздел "GitHub Actions setup": required secrets, как добавить через `gh secret set`, branch protection rule, что не настроено (CF Workers preview, Lighthouse CI). Версия документа: v1.1.
- [docs/SECURITY-AUDIT.md](../SECURITY-AUDIT.md) — L10 (pnpm audit gate) переключен на `[x] closed` с описанием decision (`--audit-level=high` в CI, `moderate` в weekly).

---

## Required GitHub secrets

Установить через GitHub UI (Settings → Secrets and variables → Actions) или CLI:

```bash
gh secret set VERCEL_TOKEN              # https://vercel.com/account/tokens
gh secret set VERCEL_ORG_ID             # из apps/miniapp/.vercel/project.json
gh secret set VERCEL_PROJECT_ID_MINIAPP # после vercel link в apps/miniapp
gh secret set VERCEL_PROJECT_ID_ADMIN   # после vercel link в apps/admin
```

Получить ID:
```bash
cd apps/miniapp && pnpm dlx vercel link  # запросит проект → создаст .vercel/project.json
cat apps/miniapp/.vercel/project.json    # orgId + projectId
# Тот же VERCEL_ORG_ID для admin, projectId — разный per app
```

Branch protection rule на `main` (рекомендуется):
- Settings → Branches → Add rule
- Require status checks: `Typecheck`, `Lint (biome)`, `Test`, `Build`, `Audit (high+)`
- Это блокирует force-merge сломанного кода в main

---

## Security posture после сессии

```
CRITICAL: 6/6 ✅
HIGH:     8/9 (H7 upload quota остался)
MEDIUM:   9/9 ✅
LOW:      1/10 (L10 closed)
Total:    24/35 (note: LOW не были все в первоначальном scope — но L10 закрыт)
```

Из активных gaps:
- **HIGH-7** Upload quota — таблица uploads_log (migration 0005).
- **L1-L9** informational — UUID v4/v7 assert, R2 originalName XSS, wrangler vars CI lint, .env.* gitignore, source.url https-only, LLM logs PII strip, FactCheck dedup, Inngest cached client.

---

## Что работает / verify

### Локально

```bash
pnpm typecheck         # 9/9 ✅
pnpm exec biome ci .   # exit 0 ✅
pnpm audit --prod --audit-level=high   # 0 high+, 1 moderate (acceptable)
```

### В GitHub

После push'а commits — workflows автоматически запустятся:

- **CI on push/main**: https://github.com/BIZKON/x10-daily/actions/workflows/ci.yml
- **Security weekly cron**: следующий запуск 2026-06-01 09:00 UTC
- **Preview**: запустится на первом PR после merge

**Что нужно подтвердить вручную после первого CI run:**
- [ ] Все 5 CI jobs прошли (зелёные)
- [ ] Audit job не упал (`valibot>=1.2.0` override применён)
- [ ] Security workflow — dependency-review action работает (на следующем PR)
- [ ] Preview workflow — задеплоит после установки VERCEL_* secrets

---

## Delta из session 11

| Слой | Session 11 | Session 12 |
|---|---|---|
| GitHub workflows | — | **3** (ci.yml · security.yml · preview.yml) |
| Workflow jobs | — | **9** (typecheck/lint/test/build/audit + dep-review/audit-strict + miniapp/admin) |
| pnpm overrides | — | **1** (valibot>=1.2.0 для GHSA-vqpr-j7v3-hqw9) |
| Closed findings | 23/25 (92%) HIGH+ | + L10 closed |
| Required GH secrets | — | **4** (VERCEL_TOKEN, ORG_ID, PROJECT_ID×2) |
| DEPLOY.md sections | 11 | **12** (новый §11 GitHub Actions) |

---

## Не работает / нужно

Не изменилось из session 11 (✓ = закрыто в эту сессию):

1. ✓ ~~CI/CD GitHub Actions~~ — закрыто.
2. **БД не развёрнута** — Neon Frankfurt не создан.
3. **apps/api worker** не задеплоен.
4. **R2 bucket** не создан.
5. **Anthropic ZDR контракт** не подписан.
6. **KikuAI Masker** не задеплоен.
7. **Inngest cloud** не настроен.
8. **@BotFather setup** — bot не создан.
9. **HIGH-7 Upload quota** — открыт.
10. **Cron triggers** в Inngest — не настроены.
11. **PostHog fetcher** для ScoreWeeklyAgent.
12. **vitest-pool-workers regression** — apps/api тесты не запускаются.
13. **VERCEL_* secrets** не установлены в GitHub — preview.yml упадёт на первом PR пока не настроены.
14. **L1-L9 informational** — в backlog.
15. **Sidebar на /login admin** — minor UX issue.

---

## Что дальше

### Приоритет A: prod-готовность

- **Фаза 2 — реальный стек** (Neon + wrangler deploy + R2 + Inngest cloud + @BotFather + VERCEL_* secrets). После Phase 2 CI/CD начинает работать полностью.

### Приоритет B: оставшиеся security gaps

- **HIGH-7 Upload quota** — миграция 0005 (uploads_log table), per-user counter за 24h. Cap 100/day, 500 MB total. ~1 сессия, локально.
- **L1-L9 informational batch** — все мелкие best-practices в один проход.

### Приоритет C: интеграции

- **AudioAgent** через ElevenLabs WS-proxy на Render (skill `elevenlabs-voice-agent-russia`).
- **Resend newsletter** для daily 06:00 МСК.
- **VisualAgent** через Gemini 2.5 Flash proxy.
- **MAX OAuth provider** — добавить login flow для платформы MAX (CLAUDE.md §2).

---

## Стартовый промпт для следующей сессии

> Прочитай `docs/handoffs/handoff-session-12.md` целиком (самый свежий). Если security — `docs/SECURITY-AUDIT.md`. Если deploy — `docs/DEPLOY.md`. Подтверди typecheck clean: `pnpm typecheck`. Я хочу [выбери: Фаза 2 — поднять реальный стек (Neon + wrangler + R2 + Inngest cloud + VERCEL secrets, см. DEPLOY.md) / HIGH-7 Upload quota (migration 0005) / L1-L9 informational batch (9 findings) / AudioAgent через ElevenLabs / Resend newsletter / VisualAgent / MAX OAuth provider]. Покажи план перед действиями.
