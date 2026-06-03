# Handoff · Session 17 — M0 LIVE на Timeweb (deploy жив в проде)

**Дата:** 3 июня 2026
**Что произошло:** M0 доведён до живого прода. Сначала локальный Docker-dry-run выявил и закрыл 5 deploy-блокеров (до VM), затем — полное провижининг Timeweb (VPC + managed PG + Cloud Server) и `./deploy.sh`, по ходу которого всплыло ещё 6 блокеров. Итог: **7 контейнеров healthy, HTTPS с Let's Encrypt, БД с миграциями+pgvector, AI Gateway, Inngest с 6 функциями.**
**Репозиторий:** https://github.com/BIZKON/x10-daily
**HEAD:** `d77c1ae` · `origin/main` synced · working tree clean.
**Предыдущий handoff:** [handoff-session-16.md](./handoff-session-16.md) (HEAD был `4675324`).

---

## 0. TL;DR — что живо в проде ПРЯМО СЕЙЧАС

| URL | Статус |
|---|---|
| https://api.pro-agent-ai.ru/health | `200 {"status":"ok","service":"x10-api","env":"production"}` |
| https://app.pro-agent-ai.ru | `200` (miniapp) |
| https://admin.pro-agent-ai.ru | `307→/login` (admin, HIGH-2 session auth) |

TLS — Let's Encrypt (Caddy auto), валиден до 2026-09-01.

> **Домен временный.** `x10.media` на Cloudflare → в РФ плохо. Взяли поддомены существующего Timeweb-домена `pro-agent-ai.ru`. Решить с доменом — пост-M0.

---

## 1. Timeweb inventory (ru-1, зона spb-3)

VPC `x10-daily-net` = `network-0312363b32a848abb2d81f3c00237412` (10.10.0.0/24).

| Ресурс | ID | Адрес / детали |
|---|---|---|
| Cloud Server `x10-daily-vm` | 8236671 | public **37.77.105.82**, local 10.10.0.5, preset 2453 (2vCPU/4G/50G nvme) |
| Postgres 17 `x10-daily-db` | 4172133 | public 81.200.146.49, local **10.10.0.4**, preset 357, db `x10`, user `gen_user` |
| SSH-key `x10-daily-mac` | 624935 | ed25519, **без passphrase** |
| DNS A-records | api/admin/app.pro-agent-ai.ru | → 37.77.105.82 |

**Доступ:** `ssh root@37.77.105.82` (ключ `~/.ssh/id_ed25519`, без passphrase). Репо на VM: `/opt/x10-daily` (HEAD = origin/main). `.env.production` (chmod 600) — все секреты. Передеплой: `cd /opt/x10-daily && ./deploy.sh`.

---

## 2. Коммиты сессии (11 штук, все в origin/main)

| SHA | Тип | Что |
|---|---|---|
| `8501cf8` | fix(infra) | 5 deploy-блокеров: migrate-в-образе, tsconfig.base copy, X10_API_BASE_URL контракт, Inngest CLI-флаги, drizzle journal 0006 |
| `6e87312` | fix(web) | build-phase guard (NEXT_PHASE) в getBaseUrl + sentinel generateStaticParams под Cache Components |
| `fba75ff` | refactor(admin) | 13 страниц → Suspense-обёртки + layout под Cache Components Next 16 |
| `61007f3` | fix(admin) | login/page.tsx Suspense (followup) |
| `ec08c64` | fix(infra) | pipeline-образ ↦ root метафайлы (corepack pnpm pin) |
| `0fd8626` | feat(workers) | post-to-tg ↦ опциональный TELEGRAM_PROXY_URL (Finding #7) |
| `bbeee45` | fix(infra) | pipeline ↦ ingest source + api ↦ root метафайлы |
| `1304a36` | fix(infra) | pipeline ↦ COPY ingest node_modules (drizzle-orm resolve) |
| `d52d1b1` | fix(infra) | pipeline ↦ X10_JWT_SECRET в compose env |
| `e7897e2` | fix(config) | loadEnv per-service requiredKeys (pipeline не требует JWT) |
| `d77c1ae` | fix(infra) | INNGEST_BASE_URL для self-host sync |

---

## 3. Фаза A — локальный dry-run (5 блокеров до VM)

Через `docker compose build` + `drizzle-kit migrate` против `pgvector/pgvector:pg17` на Mac, ДО провижининга. Каждый бы упал на VM в разной фазе:

1. **migrate-в-образе:** pipeline runner-стейдж не копировал `drizzle.config.ts` + `drizzle/*.sql` → `db:migrate` падал «no config».
2. **tsconfig.base:** admin/miniapp builder не копировал корневой `tsconfig.base.json` → `next build` падал «extends doesn't resolve».
3. **X10_API_BASE_URL:** код читает серверный `X10_API_BASE_URL`, compose клал `NEXT_PUBLIC_API_URL` (не читается нигде) → рантайм-падёж.
4. **Inngest CLI-флаги:** `inngest start` читает только флаги, не env → persist молча падал в SQLite.
5. **drizzle journal 0006:** orphan `0006_seen_items_channels.sql` не в `meta/_journal.json` → seen_items/channels не создавались. Тесты не ловили (e2e на in-memory заглушках).

**+ Cache Components (Next 16):** admin/miniapp с `cacheComponents:true` требуют async-fetch в `<Suspense>`. 13 admin-страниц + article route отрефакторены (wrapper→Suspense→async Content). build-phase guard `NEXT_PHASE` в getBaseUrl/isDemoMode (не падать на prerender без бэкенда). Sentinel generateStaticParams (Cache Components требует ≥1 результат).

**Verified локально:** 4 образа собраны, 7 миграций применены в pipeline-образе, standalone server.js путь корректен.

---

## 4. Фаза B — live deploy (ещё 6 блокеров на VM)

| # | Блокер | Фикс |
|---|---|---|
| 6 | DockerHub 429 (rate limit для анонимных pulls из РФ-ЦОД) | `/etc/docker/daemon.json` → `registry-mirrors: [mirror.gcr.io]` |
| 7 | `&` в INNGEST_POSTGRES_URI ломает `source` в deploy.sh | значения с спецсимволами в кавычки в .env.production |
| 8 | pg-driver verify-full vs Timeweb self-signed серт | `sslmode=disable` (приватная VPC-сеть) |
| 9 | pipeline: ERR_MODULE_NOT_FOUND @x10/worker-ingest + drizzle-orm | COPY ingest source + node_modules в pipeline Dockerfile |
| 10 | api: corepack pnpm 11 vs 10 конфликт | COPY root метафайлы (как ec08c64 для pipeline) |
| 11 | pipeline X10_JWT_SECRET missing + loadEnv | loadEnv per-service requiredKeys (pipeline не требует JWT) |
| 12 | Inngest functions:[] — SDK не знал self-host адрес | INNGEST_BASE_URL=http://inngest:8288 в pipeline+api |

**Все 6 Inngest-функций зарегистрированы:** ingest-vc-rss (cron), process-source-item, draft-article, post-to-tg, assemble-newsletter, run-weekly-score.

---

## 5. Live-acceptance (всё verified)

```
docker compose ps          → 7/7 (redis/api/pipeline/inngest/admin/miniapp/caddy)
\dx                        → vector 0.8.2 + pgcrypto + plpgsql
migrations                 → 7 applied, 18 tables (incl. seen_items, channels)
curl https://api.../health → 200 OK, валидный LE-сертификат
AI Gateway chat.completions→ HTTP 200, OpenAI-формат (адаптер НЕ нужен)
Inngest GraphQL functions  → 6 функций
```

---

## 6. Что осталось (пост-M0, НЕ блокеры)

1. **Dedicated TG-бот** — сейчас `@Sekretar_Syrov_IP_bot` (не наш), `TG_TEST_CHANNEL_ID` пуст → cron тикает но не публикует. Создать `@x10_daily_test_bot`, добавить админом в тестовый канал, задать `TG_TEST_CHANNEL_ID` в .env.production → живой walking-skeleton постинг.
2. **Домен** — `x10.media` (Cloudflare, плохо в РФ). Перевести на Timeweb DNS / РФ-регистратор, или оставить pro-agent-ai.ru поддомены.
3. **Ротация секретов** прошедших через чат: AI_GATEWAY_API_KEY, TELEGRAM_BOT_TOKEN.
4. **S3/Resend/PostHog/Sentry** — пустые в .env.production, задать когда нужны (аватары, newsletter, аналитика, errors).
5. **DATABASE_URL пароль** — пароль БД был передан через сырой API при сбросе; в .env.production URL-encoded. Можно поротировать.

---

## 7. Известные грабли Timeweb (зафиксированы в skill `timeweb-telegram-deploy`)

Skill дополнен разделами A–K (lessons этой сессии):
- **A.** ssh-key API баги (twc create игнорит, POST 500) → cloud-init `#!/bin/sh`
- **B.** SSH passphrase — `Server accepts key`+`did not send packet` = passphrase, не отсутствие ключа
- **C.** PG password validator (8-24 chars, обязателен спецсимвол)
- **D.** vds_blocked после >3 create/remove (fraud-detection)
- **E.** api.telegram.org из ru-1 spb-3 РАБОТАЕТ прямо (проверять curl'ом)
- **F.** multi-container стек → Cloud Server + docker-compose (не App Platform)
- **G.** DockerHub 429 → GCR mirror
- **H.** Inngest self-host functions:[] → INNGEST_BASE_URL + restart
- **I.** Managed PG SSL verify-full → sslmode=disable
- **J.** .env `&` ломает source → кавычки
- **K.** Timeweb DNS: twc CLI баг, сырой API с subdomain-полем работает

Также Section 0 — рекомендация подключить **Timeweb Cloud MCP** (post-M0).

---

## 8. Стартовый промпт для следующей сессии

> Прочитай `docs/handoffs/handoff-session-17.md`. M0 живёт в проде на Timeweb (https://api.pro-agent-ai.ru/health → 200). VM 37.77.105.82 (ssh root@, ключ без passphrase), репо /opt/x10-daily, передеплой `./deploy.sh`. HEAD `d77c1ae`, working tree clean.
>
> Выбери задачу: (a) dedicated TG-бот `@x10_daily_test_bot` + TG_TEST_CHANNEL_ID → живой walking-skeleton постинг (cron→draft→TG); (b) решить домен x10.media; (c) расширение autonomous контура (ещё RSS-источники, VK/Дзен posting, AudioAgent); (d) пост-M0 hardening (S3 аватары, Sentry, ротация секретов).

---

## 9. Ссылки

| Хочешь | Открой |
|---|---|
| Deploy state (актуальный inventory) | memory `project_x10_deploy_state.md` |
| Timeweb грабли | skill `timeweb-telegram-deploy` (разделы A–K) |
| Prod compose | [docker-compose.prod.yml](../../docker-compose.prod.yml) |
| Deploy script | [deploy.sh](../../deploy.sh) |
| Архитектура | [docs/strategy/architecture-spec.md](../strategy/architecture-spec.md) |
| Предыдущий handoff | [handoff-session-16.md](./handoff-session-16.md) |
