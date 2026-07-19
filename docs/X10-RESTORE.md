# X10 Daily — рунбок восстановления (консервация 19.07.2026)

Проект X10 Daily **законсервирован** в пользу ребрендинга (движок остался на `main`,
смыслы меняются). Этот документ — как развернуть **аналогичный X10** с нуля,
когда придёт время. Оценка: **~1–1.5 часа** при готовых ресурсах Timeweb.

## Точки консервации

| Что | Где |
|---|---|
| Код (финальный X10) | git-тег **`x10-daily-final`** + ветка **`x10-legacy`** (GitHub BIZKON/x10-daily) |
| Дамп прод-БД (245 МБ, 36 таблиц, db `x10`) | VM `/root/x10-archive/x10-db-2026-07-19.pgdump` + локально `~/x10-daily-backup/` (Mac Константина) |
| Секреты `.env.production` | VM `/root/x10-archive/x10.env.backup-2026-07-19` + локально `~/x10-daily-backup/` (chmod 600, **НЕ в git**) |
| IPv6-watchdog + sysctl (жили ВНЕ git на VM) | `scripts/infra/` в этом репо (см. шаг 4) |
| Знание/грабли всех сессий | `docs/handoffs/` + memory `project_x10_deploy_state.md` |

В дампе — всё состояние продукта: 330+ статей, юзеры, реакции, закладки,
user_preferences, sources (5 RSS + прайминг seen_items), pipeline_runs ($-ledger),
posting_control. Inngest-БД НЕ дампилась — её состояние одноразовое (функции
пере-регистрируются на boot).

## Ресурсы (что создать в Timeweb, если нет)

Оригинальная конфигурация (память `project_x10_deploy_state.md`, раздел inventory):
- **Cloud Server**: ru-1 spb-3, preset 2453 (2 vCPU / 4 GB / 50 GB), Ubuntu 24.04 + Docker/Compose v2. В VPC.
- **Managed Postgres 17** в том же VPC (расширение **vector включить ДО первого migrate**).
- **DNS A-записи**: `api.` / `app.` / `admin.` → IP VM (были поддомены pro-agent-ai.ru; целевой домен x10.media).
- DockerHub-зеркало: `/etc/docker/daemon.json` → `{"registry-mirrors":["https://mirror.gcr.io"]}`.

## Шаги восстановления

1. **Код**: `git clone https://github.com/BIZKON/x10-daily /opt/x10-daily && cd /opt/x10-daily && git checkout x10-daily-final`
2. **Секреты**: положить бэкап env → `/opt/x10-daily/.env.production` (chmod 600).
   Проверить/обновить: `DATABASE_URL` (новая managed PG), `X10_BASE_DOMAIN`,
   `TELEGRAM_BOT_TOKEN` (см. «Бот» ниже), `INNGEST_POSTGRES_URI`.
3. **БД**: создать пустую db (напр. `x10`) → восстановить дамп:
   `docker run --rm --network host -v /root/x10-archive:/a -e PGURL="$DATABASE_URL" postgres:17-alpine sh -c 'pg_restore -d "$PGURL" --no-owner --no-privileges /a/x10-db-2026-07-19.pgdump'`
   (Дамп уже содержит схему — `db:migrate` на шаге 5 будет no-op/докатит новое.)
4. **IPv6 (КРИТИЧНО — api.telegram.org из РФ только по IPv6)**:
   - `cp scripts/infra/99-x10-ipv6.conf /etc/sysctl.d/ && sysctl --system`
   - `cp scripts/infra/x10-ipv6-ensure.sh /usr/local/sbin/ && chmod +x /usr/local/sbin/x10-ipv6-ensure.sh`
   - `cp scripts/infra/x10-ipv6-ensure.{service,timer} /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now x10-ipv6-ensure.timer`
   - `apt-get install -y ndisc6 dhcpcd-base` (rdisc6 + dhcpcd — инструменты watchdog).
   - Проверка: `curl -6 -sS -o /dev/null -w "%{http_code}\n" https://api.telegram.org` → 302.
   - ⚠️ **`netplan apply` НЕЛЬЗЯ** (снесёт IPv6: netplan там accept-ra:false; адрес — ТОЛЬКО DHCPv6, SLAAC не работает; watchdog лечит /2 мин).
5. **Деплой**: `./deploy.sh` (build → db:migrate → up -d). Проверить `https://api.<домен>/health` → 200.
6. **Inngest**: после первого подъёма функции регистрируются на boot. Если functionCount неполный — re-sync: `docker compose -f docker-compose.prod.yml --env-file .env.production exec api sh -c 'wget -q -O- --method=PUT http://pipeline:8787/inngest'` (⚠️ именно из api-контейнера, НЕ localhost из pipeline).
7. **Бот + канал**: бот-админ канала для постинга; ЕГО ЖЕ токен в `TELEGRAM_BOT_TOKEN`
   (auth Mini App и постинг — ОДИН токен, initData HMAC валидируется им).
   Menu button (запуск Mini App): Bot API `setChatMenuButton` → `{"menu_button":{"type":"web_app","text":"Х10 Daily","web_app":{"url":"https://app.<домен>"}}}`.
   Оригинал: бот @Sekretar_Syrov_IP_bot (id 8189028690), канал «Деловой вестник» @delovoy_vestnik (chat_id -1003773645085), TG_OPS_CHAT_ID=247247870 (личка).
8. **Проверка контура**: лента `app.<домен>` живая; `docker compose logs pipeline` — cron ingest-rss тикает; слот-постинг 09:30/12:30/15:30/18:30 МСК; `journalctl -t x10-ipv6` — watchdog жив.

## Главные грабли (полный список — handoffs + memory)

- Деплой/рестарт **только** `./deploy.sh` или `docker compose --env-file .env.production ...` — иначе пустые `${VAR}` → crash-loop.
- Миграции **hand-written + журнал**, `db:generate` НЕЛЬЗЯ.
- PPR/Cache Components: живые данные → `connection()` ВНУТРИ Suspense + `"use cache"` на data-fn, иначе build запечёт мок.
- Новый env-ключ воркера → добавлять в `readBindingsFromEnv` (bindings.ts), иначе не доедет.
- Новые RSS-источники: INSERT в `sources` + **прайминг seen_items** (иначе флуд бэклогом). Коммерсантъ требует `*/*` в Accept.
- `/v1/digests/latest` потребляет админка (контракт не менять); miniapp ходит в `/hero`.
- PostHog: ключ `NEXT_PUBLIC_POSTHOG_KEY` инлайнится на БИЛДЕ (build-arg); пустой = выключен; клиент ходит через same-origin `/ingest` (Caddy → PostHog EU).

## Что было живо на момент консервации (19.07.2026, HEAD = тег)

Автономный контур: RSS (5 источников) → DeepSeek v4-flash пайплайн (языковой гейт
«только русский», FactCheck-halt) → слот-постинг 4/день в канал. Mini App запущен
(menu button), лента 40+/hero/читалка/реакции/закладки/prefs/налоги/видео — всё живое,
вход починен (initData HMAC: исключать ТОЛЬКО `hash`). PostHog-интеграция готова
(дормантна — ключ не задавался). Расход ~$0.33/день.
