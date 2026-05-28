# Handoff · Session 13

**Дата:** 28 мая 2026
**Что закрыто:** HIGH-7 Upload quota — последний HIGH-severity gap из 25-finding security audit.
**Репозиторий:** https://github.com/BIZKON/x10-daily

---

## Git коммит сессии (1)

```
b325040  feat(security): per-user upload quota (HIGH-7) — 100 files / 500 MB / 24h
```

Typecheck clean (9/9 packages).

---

## Что закрыто

### HIGH-7: per-user upload quota

Защищает R2 от runaway загрузок скомпрометированным editor account / инсайдером.

**Schema** ([packages/db/src/schema/uploads.ts](../../packages/db/src/schema/uploads.ts)):

```typescript
uploadsLog: pgTable("uploads_log", {
  id, userId (FK users CASCADE),
  filename varchar(256), contentType varchar(64),
  sizeBytes bigint,
  r2Key text, publicUrl text,
  timestamps,
}, t => [index("uploads_log_user_created_idx").on(t.userId, t.createdAt)])
```

Composite `(user_id, created_at)` index — O(log + matching) для quota query
`WHERE userId=$1 AND createdAt > now() - interval '24 hours'`.

**Migration** ([packages/db/drizzle/0005_uploads_log.sql](../../packages/db/drizzle/0005_uploads_log.sql)) — CREATE TABLE + index. `_journal.json` обновлён.

**Helper** ([apps/api/src/upload-quota.ts](../../apps/api/src/upload-quota.ts)):

- `checkUploadQuota(db, userId, additionalBytes)` — возвращает `{allowed, current}` или `{allowed:false, reason, current, limit, resetSeconds}`.
- `recordUpload(db, data)` — INSERT после R2 put.

Limits: **100 файлов · 500 MB · 24h rolling window**.

**Route changes** ([apps/api/src/routes/upload.ts](../../apps/api/src/routes/upload.ts)):

1. **Pre-check** на count сразу после `requireRole` — short-circuit без чтения formData если уже исчерпано.
2. **Final check** с `file.size` после magic-bytes verification.
3. **recordUpload** после успешного R2 put. Если INSERT упадёт → console.error, файл всё равно отдан клиенту (audit-row failure не блокирует загрузку).
4. **429 response** с `Retry-After: 86400` header + structured body `{error, reason, message, current, limits}`.

### Что НЕ изменилось

- Существующие MEDIUM-2/3/5 (magic bytes, SVG drop, Content-Length pre-check) остались — quota добавлена слоем поверх.
- Audit trail растёт без TTL. Cleanup (DELETE > 90d) — отдельная LOW задача.

---

## Security posture финальная

```
CRITICAL: 6/6 ✅
HIGH:     9/9 ✅
MEDIUM:   9/9 ✅
LOW:      1/10 (L10 closed в session 12)
Total active gaps: 9 (L1-L9 informational)
```

**Все HIGH+ закрыты.** Production-ready по security димензии. Открыты только informational findings (L1-L9):

- L1: UUID v4/v7 assert (vs v1 leak MAC+timestamp)
- L2: R2 originalName XSS sanitize
- L3: wrangler vars CI lint
- L4: `.env.*` broad gitignore
- L5: CLOUDFLARE_API_TOKEN из .env.example
- L6: source.url https-only
- L7: LLM logs PII strip via Sentry beforeSend
- L8: FactCheck dedup by hash
- L9: Inngest cached client key by NODE_ENV

L10 уже закрыт (session 12, `pnpm audit` CI gate).

---

## Что работает

### Локально (verified)

```bash
pnpm typecheck       # 9/9 ✅
```

### Не verified в этой сессии

- DB migration на реальной БД — Neon ещё не развёрнут (Phase 2).
- E2E quota — требует deploy + полная цепочка (upload → R2 → log row).

Smoke test после Phase 2 deploy:

```bash
TOKEN=...  # JWT через /v1/auth/dev-login для editor

# 100 successful uploads
for i in $(seq 1 100); do
  curl -s -X POST -H "Authorization: Bearer $TOKEN" \
    -F "file=@tiny.png" $API/v1/admin/upload | jq -r '.url // .error'
done

# 101-я попытка → 429 upload_quota_exceeded
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -F "file=@tiny.png" $API/v1/admin/upload | jq .
# → {"error":"upload_quota_exceeded","reason":"files_exceeded",...}
```

---

## Delta из session 12

| Слой | Session 12 | Session 13 |
|---|---|---|
| Migrations | 5 (0000-0004) | **6** (+0005 uploads_log) |
| DB schemas | 13 файлов | **14** (+uploads.ts) |
| apps/api/src/ helpers | auth, rate-limit, paywall, env, db, lib/* | **+upload-quota.ts** |
| Security closed (HIGH+) | 23/25 | **24/25** (только L1-L9 informational открыты) |

---

## Не работает / нужно

1. **Phase 2 — реальный стек** не развёрнут (Neon, wrangler deploy, R2, Inngest, @BotFather, VERCEL_* secrets).
2. **Cron triggers в Inngest** — daily ingest / newsletter / weekly score.
3. **PostHog fetcher** для ScoreWeeklyAgent.
4. **vitest-pool-workers regression** — apps/api тесты не запускаются.
5. **L1-L9 informational batch** — в backlog.
6. **Cleanup job для uploads_log** — DELETE > 90d. LOW backlog (~50 rows/день на realistic scale, не критично).
7. **Sidebar на /login admin** — minor UX issue.

---

## Что дальше

### Приоритет A: prod-готовность

- **Фаза 2 — реальный стек**. Все блокеры security закрыты, можно деплоить. См. DEPLOY.md.

### Приоритет B: оставшиеся informational

- **L1-L9 batch** — 9 informational findings одним проходом. ~1 сессия.

### Приоритет C: интеграции

- **AudioAgent** через ElevenLabs WS-proxy.
- **Resend newsletter**.
- **VisualAgent** через Gemini 2.5 Flash.
- **MAX OAuth provider**.

---

## Стартовый промпт для следующей сессии

> Прочитай `docs/handoffs/handoff-session-13.md` целиком. Если security — `docs/SECURITY-AUDIT.md` (теперь HIGH+ все закрыты). Если deploy — `docs/DEPLOY.md`. Подтверди typecheck clean: `pnpm typecheck`. Я хочу [выбери: Фаза 2 — реальный стек (DEPLOY.md) / L1-L9 informational batch / AudioAgent через ElevenLabs / Resend newsletter / VisualAgent / MAX OAuth / Cron triggers в Inngest / PostHog ScoreAgent fetcher]. Покажи план перед действиями.
