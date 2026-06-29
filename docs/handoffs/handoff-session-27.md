# Handoff · Session 27 — graphify (граф знаний кодовой базы) + НЕзапушенный хвост s26 (daily-take финал + PostHog EU)

**Дата:** 29 июня 2026
**Что произошло:** (1) Подключён **graphify** — локальный граф знаний кодовой базы (CLI + post-commit авто-ребилд + Claude-Code хуки «graphify-first»). (2) При закрытии сессии вскрыт и задокументирован **НЕзапушенный хвост работы после s26**: финал daily-take П1/П2/П3 + PostHog (EU) аналитика — два коммита (14 июня) висят локально, на прод НЕ выкачены.
**HEAD кода:** `e3bbe50` · ⚠️ `main` **ahead 3** относительно `origin/main` (НЕ запушено) · graphify-конфиг **uncommitted**.
**Предыдущий handoff:** [handoff-session-26.md](./handoff-session-26.md). Inventory / доступы / грабли инфры — memory `project_x10_deploy_state.md`.

---

## 🔵 ГДЕ ОСТАНОВИЛИСЬ (точка возврата)

Эта сессия **не трогала продакшен** и **ничего не коммитила/пушила**. Состояние строго локальное:

1. **graphify настроен и работает локально**, но изменения-конфиг (`CLAUDE.md`, `.gitignore`, `.claude/settings.json`) **НЕ закоммичены** — ждут явного «да» Константина (commit + push).
2. **Хвост s26 (`6ecce2a` + `e3bbe50`, daily-take финал + PostHog EU) и сам коммит handoff-s26 (`d7f97b2`) — НЕ запушены** (`main` ahead 3). На прод PostHog/финал daily-take **ещё не выехали**.
3. Прод-контур и Mini App **в состоянии конца s26** (live, см. ниже) — эта сессия его не верифицировала вживую (SSH/прод-секреты не читались).

**Первое решение в новой сессии:** пушить или нет (handoff-s27 + graphify-конфиг + хвост s26). Push в `main` блокируется авто-классификатором на КАЖДЫЙ коммит → **нужно явное «да» Константина**, затем `./deploy.sh` (тогда PostHog+финал daily-take уедут на прод).

---

## 0. TL;DR — что ЖИВО ПРЯМО СЕЙЧАС

- **Автономный контур** (без изменений с s26): DeepSeek v4-flash, RSS→draft→4 слота/день (09:30·12:30·15:30·18:30 МСК), IPv6-watchdog, языковой гейт «только русский». *Состояние — как на конец s26; эта сессия live не перепроверяла.*
- **Mini App** (`app.pro-agent-ai.ru`) — на проде версия `origin/main` (= `e173e23`). **PostHog и финал daily-take ЕЩЁ НЕ на проде** (висят в ahead-3).
- **graphify** — локальный инструмент навигации по коду: `graphify query "<вопрос>"` / `path` / `explain` / `update .`. Авто-ребилд после каждого коммита. Граф **gitignored** (строится на каждой машине отдельно).

---

## 1. graphify — граф знаний кодовой базы (новое в этой сессии)

**Зачем:** быстрый scoped-subgraph по вопросу вместо слепого grep/широкого чтения файлов — дешевле по контексту на большой монорепе.

**Что поставлено / изменено:**
- **CLI** `graphify` v0.8.49 — `/Users/konstantin/.local/bin/graphify` (pipx-venv `graphifyy`). Команды: `graphify query "<вопрос>"` (scoped subgraph), `graphify path "<A>" "<B>"` (связи), `graphify explain "<concept>"`, `graphify update .` (инкрементальный ребилд, **AST-only, без API-затрат**).
- **`.git/hooks/post-commit`** (установлен `graphify hook install`, 26 июня) — после каждого коммита **детачед** ребилдит граф (только код-файлы, без LLM). Скипает во время rebase/merge/cherry-pick; пин `PYTHONHASHSEED=0` для воспроизводимости кластеризации; лог `~/.cache/graphify-rebuild.log`.
- **`graphify-out/`** — артефакты графа (`graph.json` ~2.1MB, `GRAPH_REPORT.md`, `manifest.json`, `graph.html`, `cache/`), собраны 26 июня. ⚠️ **gitignored** (`.gitignore:118 graphify-out/`) → на каждой новой машине/клоне строится заново; до этого хуки no-op.
- **`.claude/settings.json`** (untracked) — два PreToolUse-хука Claude Code: на `Bash` (grep/find/rg/fd/ack/ag) и на `Read|Glob` (исходники) впрыскивают MANDATORY-напоминание «сначала `graphify query`». **Срабатывают ТОЛЬКО если `graphify-out/graph.json` существует** → на машинах без собранного графа безопасно no-op.
- **`CLAUDE.md`** — добавлена секция `## graphify` с этими правилами (читается первой каждую сессию).

**⚠️ Грабли / нюансы graphify:**
- Граф **не в git** → новый исполнитель должен собрать сам (`graphify .` в корне) — иначе `graphify query` пусто, хуки молчат.
- Хуки в `.claude/settings.json` ссылаются на graphify, но **безопасны для тех, у кого его нет** (gate по `graph.json`). Решить при коммите: оставлять ли `.claude/settings.json` под git (тогда правило «graphify-first» распространится на всю редколлегию/CI).
- `graphify-out/wiki/` пока **не сгенерён** (правило в CLAUDE.md про `wiki/index.md` сработает только когда появится).
- `.md` входит в список расширений хука Read → напоминание триггерится и на чтении доков; это норм (advisory), для конкретного известного файла Read допустим.

---

## 2. ⚠️ НЕзапушенный хвост s26 (требует решения push)

`main` **ahead 3** от `origin/main` (= `e173e23`). Три коммита 13–14 июня, которые НЕ на проде:

| Хэш | Дата | Что |
|---|---|---|
| `d7f97b2` | 13 июня | docs: сам handoff-session-26 |
| `6ecce2a` | 14 июня | **daily-take карточка — финал П1/П2/П3** (`apps/miniapp/src/components/cards/daily-take-card.tsx`): дата+время МСК, живые реакции-popover, статус-пилюли — добиты на тип daily-take (в s26 были сделаны на news/deep-dive). |
| `e3bbe50` | 14 июня | **PostHog (EU) аналитика** (152-ФЗ: EU-регион). См. ниже. |

**PostHog `e3bbe50` — состав (15 файлов):**
- `apps/miniapp/src/lib/analytics.ts` — слой аналитики (события).
- `apps/miniapp/src/components/posthog-provider.tsx` — **lazy** posthog-js провайдер (не грузится в initial bundle).
- `apps/miniapp/src/components/article/track-article-open.tsx` — трекинг открытий статьи.
- Проводка событий: `layout.tsx`, `article/[slug]/page.tsx`, `engagement-bar.tsx`, `header-bookmark.tsx`, `header-share.tsx`, `card-reactions.tsx`.
- **`caddy/Caddyfile.prod`** — `/ingest` **reverse-proxy** на PostHog EU (события идут через свой домен — устойчивость к РФ-блокировкам/ad-block).
- Инфра/env: `apps/miniapp/Dockerfile`, `docker-compose.prod.yml`, `.env.example` (+ключи PostHog), `apps/miniapp/package.json` + `pnpm-lock.yaml` (dep `posthog-js`).

⚠️ **Перед деплоем PostHog**: задать прод-env (PostHog project key + host = EU/`/ingest` proxy). Проверить `.env.example` на список ключей. 152-ФЗ: регион EU обязателен (CLAUDE.md §7).

---

## 3. ⚠️ Грабли / carry-forward (инфра — без изменений с s26)

*Подтверждено на конец s26; эта сессия инфру live не трогала. Полный inventory — memory `project_x10_deploy_state.md`.*
- **Push в `main` блокируется авто-классификатором на КАЖДЫЙ коммит → нужно явное «да» Константина.** Репо **публичный** (`github.com/BIZKON/x10-daily`; BIZKON под санкционным флагом — приватные нельзя).
- **Деплой только `./deploy.sh`** (или `docker compose --env-file .env.production`), иначе crash-loop. Новый env-ключ воркера → добавлять в `readBindingsFromEnv` (`bindings.ts`).
- **api.telegram.org только по IPv6** + глобальный адрес ТОЛЬКО по DHCPv6 (НЕ SLAAC). Self-healing watchdog `x10-ipv6-ensure.timer` /2мин. **`netplan apply` НЕЛЬЗЯ** (смывает IPv6 → постинг ETIMEDOUT).
- **PPR**: `await connection()` ВНУТРИ Suspense-компонента (НЕ на уровне page) → дыры; `"use cache"` на data-fn; per-user (закладки/реакции/prefs) НЕ кэшировать.
- **TG initData**: из data-check-string исключать **ТОЛЬКО `hash`** (`signature` ВКЛЮЧАЕТСЯ для bot-token HMAC). НЕ верифицировать криптопроверку самоподделкой тем же кодом.
- **Миграции hand-written + журнал**, `db:generate` НЕЛЬЗЯ.
- **Auth+постинг на одном токене** `@Sekretar_Syrov_IP_bot` (коуплинг; смена на dedicated-бот = новый бот админом канала + `TELEGRAM_BOT_TOKEN` + redeploy).
- VM: `ssh root@37.77.105.82`, репо `/opt/x10-daily`. **НЕ пересоздавать VM.**

---

## 4. Следующая сессия — опции

0. **(сначала) Решить push** хвоста s26 + graphify-конфиг + этот handoff → `./deploy.sh` → PostHog/финал daily-take выедут на прод; затем проверить PostHog-события live.
1. **P1 — Платежи** (revenue): Telegram Stars + ЮKassa → `subscriptions` → замкнуть paywall (`stripPaidContent` готов). Скилл `yookassa-timeweb-payments`. Нужны: ЮKassa shopId/secret + тарифы.
2. **PostHog — снять первую воронку** (после деплоя): DAU/retention/реакции/закладки (события уже проводятся).
3. **История чтения** — бэкенд `GET /v1/profile/history` ГОТОВ → экран как `/profile/saved` (пункт меню сейчас заглушка).
4. **Фичи-потребители prefs** — персональный дайджест/push читают `user_preferences` (центр настроек готов, потребителя нет).
5. **dedicated-бот** — расцепить auth+постинг.
6. **Тюнинг порогов статусов** `deriveCardStatus` по фидбеку.

---

## Стартовый промпт для новой сессии

> Прочитай (в порядке): `docs/handoffs/handoff-session-27.md` + memory `project_x10_deploy_state.md` + `CLAUDE.md`. Граф кода: `graphify query "<вопрос>"` ДО grep (если `graphify-out/graph.json` нет — собери `graphify .`). Timeweb-инфра — skill `timeweb-telegram-deploy`.
>
> Состояние: M0 + walking-skeleton ЖИВ+АВТОНОМЕН на Timeweb. **HEAD кода `e3bbe50`, но `main` ahead 3 — НЕ запушено** (handoff-s26 `d7f97b2` + финал daily-take `6ecce2a` + PostHog EU `e3bbe50`); graphify-конфиг (`CLAUDE.md`/`.gitignore`/`.claude/settings.json`) — uncommitted. **На проде ещё версия `e173e23`** (PostHog/финал daily-take НЕ выехали). Mini App ЗАПУЩЕН, вход работает (initData-фикс s26).
>
> **ЗАДАЧА:** (0) реши со мной — пушим ли хвост s26 + graphify + handoff (push в main → явное «да» → `./deploy.sh`); затем опции: P1-платежи (Stars+ЮKassa→`subscriptions`→paywall) / PostHog-воронка (после деплоя) / История чтения (`/v1/profile/history` готов → экран как `/profile/saved`) / фичи-потребители prefs / dedicated-бот / тюнинг статусов.
>
> ⚠️ Грабли: **push в main блокируется авто-классификатором на КАЖДЫЙ коммит — нужно явное «да»**; деплой только `./deploy.sh`; api.telegram.org только IPv6 (watchdog, `netplan apply` НЕЛЬЗЯ); PPR — `connection()` ВНУТРИ Suspense + `"use cache"` на data-fn (per-user НЕ кэшировать); TG initData — исключать ТОЛЬКО hash (signature ВКЛЮЧАЕТСЯ); миграции hand-written, `db:generate` НЕЛЬЗЯ; PostHog — регион EU (152-ФЗ). VM: ssh root@37.77.105.82, репо /opt/x10-daily. Режим: многоагентность ВКЛ (Workflow-ревью перед деплоем), полная автономия, только русский. НЕ пересоздавай VM.
