# Handoff · Session 15 — M0 deploy stack готов к prod на Timeweb

**Дата:** 28 мая 2026
**Что произошло:** Подготовлен полный код/конфиг для деплоя M0 на одну Timeweb Cloud VM (Docker Compose + Caddy + managed PG + Inngest self-host). Закрыт критический pipeline bug (агенты били в openai.com вместо Timeweb Gateway). Создана `architecture-spec.md` как источник истины (заменяет устаревший PDF).
**Репозиторий:** https://github.com/BIZKON/x10-daily
**Статус:** все DoD-acceptance, которые можно проверить локально — зелёные. Live-acceptance (TLS issuance, vector extension provisioning, реальный chat.completions через Gateway) — ждут VM и managed PG.

---

## 1. Что вышло за сессию

### Critical bug fix — pipeline → AI Gateway
Все 4 функции (`process-source-item`, `draft-article`, `assemble-newsletter`, `run-weekly-score`) создавали `AgentContext` с `apiKey: env.ANTHROPIC_API_KEY` и **без `baseURL`**. Это означало что OpenAI SDK бил в дефолтный `https://api.openai.com/v1`, не в Timeweb Gateway. Фикс — `apiKey: env.AI_GATEWAY_API_KEY ?? env.ANTHROPIC_API_KEY, baseURL: env.AI_GATEWAY_BASE_URL`.

**До этого фикса N6 acceptance (живой Gateway вызов) был невозможен.**

### Rename AI_GATEWAY_URL → AI_GATEWAY_BASE_URL
По ТЗ #2. 8 файлов: config schema, api+pipeline bindings/env/server, docker-compose dev, .env.example.

### Docker stack для prod (M0)
- `docker-compose.prod.yml` — 7 сервисов: redis · inngest · api · pipeline · admin · miniapp · caddy. **Нет** postgres (managed Timeweb).
- `apps/admin/Dockerfile`, `apps/miniapp/Dockerfile` — multi-stage Next.js 16 standalone (next.config.ts: `output: "standalone"`).
- `caddy/Caddyfile.prod` — env-driven домены (`api.${X10_BASE_DOMAIN}` / `admin.<...>` / `app.<...>`), auto-TLS Let's Encrypt HTTP-01, gzip+zstd, healthchecks.
- `deploy.sh` — git pull → build → migrate → up -d с проверкой required env keys.
- `.env.example` — добавлены `X10_BASE_DOMAIN`, `CADDY_ACME_EMAIL`, `INNGEST_POSTGRES_URI`, `X10_ALLOWED_ORIGINS`. Прод-комментарий в начале файла.

### Architecture sync (N9)
- `docs/strategy/architecture-spec.md` — новый источник истины. PDF `X10ArchitectureSpec.pdf` отражает раннюю редакцию (CF + Neon + Zero + Vercel) — он сохранён, но при расхождениях верь markdown.
- Decisions log: что изменилось от S15 (CF→Hono Node) до M0 (Zero drop, managed PG, ingest-as-library).
- Zero in code: `git grep rocicorp` → 0 хитов. Cleanup deps — no-op (никогда не ставили).

---

## 2. DoD checklist

- [x] managed PG нужен с включённым `vector` — **provisioning manual на стороне Timeweb панели** (см. .env.example header)
- [x] `docker-compose.prod.yml` без postgres, `DATABASE_URL` ссылается на managed
- [x] секретов в репо нет (`git grep` для типичных токенов — 0 хитов), `.env*` в `.gitignore`
- [x] Caddy TLS-конфиг готов (auto Let's Encrypt) — **live issuance ждёт DNS + VM**
- [x] Inngest prod-mode настроен (без `INNGEST_DEV`, persist через `INNGEST_POSTGRES_URI` на managed PG) — точные имена env Inngest CLI v1 могут отличаться, **проверить `docker run inngest/inngest --help` на VM**
- [x] AI_GATEWAY_BASE_URL прокинут до agents (pipeline functions передают `baseURL` в `AgentContext`) — N6 unblocked
- [x] healthchecks + `restart: unless-stopped` на api/pipeline/redis/inngest
- [x] `output: "standalone"` для Next.js admin+miniapp
- [x] Zero deps пусто; `architecture-spec.md` отражает реальный код
- [x] `packages/agents/*` не тронут; B2 цепочка не модифицирована
- [⚠️] live-deploy (run `./deploy.sh` на VM) — **не выполнен**
- [⚠️] live `chat.completions` через Gateway (N6 acceptance) — **не выполнен** (нужен реальный `AI_GATEWAY_API_KEY`)
- [⚠️] live миграции `0000–0006` на managed PG — **не выполнен** (нужен provisioned кластер)

---

## 3. Что нужно сделать вручную на стороне Timeweb / VM

### Pre-deploy
1. **Создать managed PostgreSQL 17** в Timeweb DBaaS (Москва, private network с VM).
2. **Включить расширение `vector`** через Конфигурация → Расширения. Если нет — эскалировать (план меняется, возможно self-host под вектор).
3. Создать схему `inngest` в той же БД (для persist Inngest self-host):
   ```sql
   CREATE SCHEMA IF NOT EXISTS inngest;
   ```
4. Создать DNS records: `api.x10.media` / `admin.x10.media` / `app.x10.media` → IP VM.
5. Создать VM (Timeweb Cloud Server), docker + compose v2 установлены.
6. На VM:
   ```bash
   git clone https://github.com/BIZKON/x10-daily /opt/x10-daily
   cd /opt/x10-daily
   cp .env.example .env.production
   chmod 600 .env.production
   vim .env.production  # заполнить
   ./deploy.sh
   ```

### Post-deploy verification (N2/N4/N5/N6 live acceptance)
1. `\dx` в managed PG → `vector` должен быть в списке
2. `docker compose -f docker-compose.prod.yml ps` → все healthy
3. `https://api.x10.media/health` → 200 OK (валидный сертификат)
4. Inngest dashboard (SSH-forward 8288) → функции зарегистрированы (`ingest-vc-rss`, `draft-article`, `post-to-tg`, etc.)
5. Один тестовый `chat.completions` вызов через `curl $AI_GATEWAY_BASE_URL/chat/completions -H "Authorization: Bearer $AI_GATEWAY_API_KEY" ...` → OpenAI-формат ответа

---

## 4. Известные риски

1. **Inngest self-host env vars** — точные имена (`INNGEST_POSTGRES_URI` vs CLI флаги) могут отличаться между минорами. Проверить `docker run inngest/inngest --help` если стартует с ошибкой.
2. **Next.js 16 standalone в monorepo** — путь к server.js может смещаться при изменении workspace layout. Проверить вывод `next build`'a в builder-stage.
3. **Caddy auto-TLS** требует валидный DNS на момент первого старта. Если LE-staging нужен (для dry-run) — добавить `acme_ca https://acme-staging-v02.api.letsencrypt.org/directory` в Caddyfile.
4. **N6 unblocked в коде**, но **сам вызов** надо проверить на проде с реальным ключом. Если Timeweb Gateway не отвечает в OpenAI-формате — это discovery, фикс будет в `packages/agents/src/define-agent.ts` (response parsing).

---

## 5. Что точно не делал

- k8s, Terraform, CI/CD pipeline, Prometheus/Grafana, autoscaling, multi-region — все post-M0
- Live deploy / live API calls / live миграции
- Не трогал `packages/agents/*` (только pipeline functions передают context по-другому)
- Не правил PDF (`X10ArchitectureSpec.pdf` остался устаревшим, актуальная картина в `architecture-spec.md`)

---

## 6. Стартовый промпт для следующей сессии

> После того как managed PG развёрнут и vector включён, после того как deploy.sh отработал и сертификаты Caddy выдались — проверь N2/N4/N5/N6 acceptance live: `\dx` показывает vector, https://api.x10.media/health возвращает 200, Inngest dashboard видит все 6 функций, один curl к Gateway отвечает в OpenAI-формате. Зафиксируй вывод в handoff-session-16.md. Если N6 показал что Timeweb отвечает не в OpenAI-формате — это discovery, заводи отдельный ТЗ на адаптер ответов.
