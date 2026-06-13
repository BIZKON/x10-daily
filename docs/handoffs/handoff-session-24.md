# Handoff · Session 24 — верификация DeepSeek + IPv6-инцидент + v4-flash + M1/P0 «добить miniapp»

**Дата:** 10 июня 2026
**Что произошло:** Большая сессия из четырёх блоков. (1) Верифицировал автономный ночной DeepSeek-прогон. (2) Нашёл и устранил **инцидент** — постинг был в дауне (IPv6 отвалился), захардил self-healing watchdog. (3) По решению Константина переключил прод-модель на **deepseek-v4-flash** (с adversarial-ревью + hardening). (4) Стартовал **M1/P0 «добить и запустить Telegram Mini App»** — наполнил ленту, достроил читалку.
**Репозиторий:** https://github.com/BIZKON/x10-daily
**HEAD кода:** `aaa8850` · `origin/main` synced · задеплоено (3 деплоя за сессию).
**Предыдущий handoff:** [handoff-session-23.md](./handoff-session-23.md). Inventory/доступы/грабли — memory `project_x10_deploy_state.md`.

---

## 0. TL;DR — что ЖИВО ПРЯМО СЕЙЧАС

- **Автономный контур постит сам** на DeepSeek **v4-flash**: RSS → IngestAgent gate → draft-цепочка → channels-очередь → cron `drain-post-slots` 4/день (09:30·12:30·15:30·18:30 МСК) в «Деловой вестник». Claude OFF.
- **IPv6 захардён**: self-healing watchdog `x10-ipv6-ensure.timer` (/2мин) — постинг переживёт рестарт systemd-networkd.
- **Miniapp ЖИВ и наполнен**: `app.pro-agent-ai.ru` — лента 40+ реальных статей, **читалка достроена** (реальный body вместо заглушки). **Готов к запуску в BotFather** (шаги ниже).
- ⚠️ **Запуск Mini App в Telegram — НЕ сделан** (шаги Константина, §4).

---

## 1. Блок A — DeepSeek verification + переключение на v4-flash

- **Ночной прогон verified ✅:** 100% deepseek, Claude=0, **$0.33/день** (потолок $15). 17 draft succeeded, 0 failed, 6 halted — **FactCheck РАБОТАЕТ корректно** (halt'ы по неподтверждённым high-stake/политике, вкл. выдуманную цитату Bloomberg = кейс Романчук). Watch-item лёгкой модели СНЯТ.
- **⚠️ Правка идентичности моделей (из API `cloud-ai/models`):** `deepseek/deepseek-chat` = **«DeepSeek V3.2»** (non-reasoning) — НЕ Flash, как ошибочно считал s23! `deepseek/deepseek-v4-flash` = отдельная V4 Flash (reasoning). Реальные цены LK: **v4-flash 19/38 ₽/М = $0.265/$0.53** (курс ЦБ 71.73). MODEL_COSTS обновлён. Цену достаёшь: `GET api.timeweb.cloud/api/v1/cloud-ai/models` (токен `~/.twcrc`) — имена/id; ЦЕНЫ только в UI-панели LK «Подключение».
- **Переключение на v4-flash (по решению Константина):** `MODEL_*=deepseek/deepseek-v4-flash` в .env.production (бэкап `.bak.s24`). v4-flash = reasoning-модель + gateway **БУФЕРИЗУЕТ** ответ (TTFB≈полное время генерации): ~70 ток/с, агент 12с–4мин (vs <2с V3.2). Откат → `deepseek-chat` (V3.2, быстрее) + deploy.sh.
- **Hardening `define-agent.ts` (нужен ВСЕМ reasoning-моделям):** (1) `DEEPSEEK_REASONING_HEADROOM=8192` к maxOutputTokens на deepseek-пути + ретрай ×2; (2) ретрай на **пустой content ИЛИ `finish_reason="length"`** (усечённый JSON); (3) **per-request `timeout: 420_000`** (дефолтный 60s openai-client рубил длинные вызовы + молча SDK-ретраил мимо $-ledger); (4) usage выброшенного вызова учтён в costUsd. gateway КЛАМПИТ max_tokens (HTTP 400 не даёт).
- **Валидация:** реальная цепочка 17/17 + FactCheck safety 3/3 halt + adversarial Workflow-ревью (10 агентов, 7 находок → high-фиксы внесены, #3 опровергнута пробой) + 172 теста + live draft через Inngest (без step-таймаута).

## 2. Блок B — IPv6-инцидент (постинг был в дауне) + durable watchdog

- **0 постов утром 10 июня:** слот 09:30 МСК упал `ETIMEDOUT` к api.telegram.org. Причина: в **06:10 UTC рестартнулся systemd-networkd** (cloud-init), сбросил kernel `accept_ra→0` + смыл глобальный IPv6-адрес/маршрут. IPv6 (api.telegram.org из РФ только по IPv6) держался на kernel-sysctl-хаке (s18), который убивает ЛЮБОЙ рестарт networkd.
- ⚠️ **Глобальный IPv6 на этом хосте — ТОЛЬКО по DHCPv6** (адрес `2a03:6f01:1:2::2:2e24`, lease 30д; netplan eth0 `dhcp6:false`!), **SLAAC НЕ работает**. `netplan apply` НЕЛЬЗЯ (переприменит `accept-ra:false` → сломает). Инструменты: `dhcpcd` (v10) + `rdisc6` (ndisc6, доставлен apt).
- **Durable-фикс:** self-healing **systemd-watchdog** `x10-ipv6-ensure.timer` (/2мин) → `/usr/local/sbin/x10-ipv6-ensure.sh` (при отсутствии route/global-addr: `accept_ra=2` + `rdisc6` + `dhcpcd -6 -1`). Логи `journalctl -t x10-ipv6`. Проверен симуляцией поломки. НЕ трогает networkd/IPv4/SSH.
- **Постинг ожил:** автономные слоты 12:30/15:30 МСК запостили сами (msg 141, 142).
- 💡 Чистый durable (под maintenance + консоль Timeweb): netplan `eth0 {accept-ra: true, dhcp6: true}` → networkd сам держит lease. Watchdog покрывает до тех пор.

## 3. Блок C — M1/P0: добить+запустить Telegram Mini App

- ⚠️ **ОТКРЫТИЕ:** miniapp+auth+content-API в основном УЖЕ построены и ЖИВУТ (прежний проектный итог недооценивал). 6 экранов, auth Mini App провязан end-to-end (initData→HMAC→JWT→cookie→Bearer; `/v1/auth/telegram` жив), paywall read-side (`stripPaidContent`).
- **Наполнение ленты (8→40+):** показывалось лишь ~8 published (их ставил только `drain-post-slots`) при 226 готовых `ready`. **persist-as-published**: `persist.ts` пишет `status:'published'+publishedAt` сразу; backfill 226 ready→published; `drain-post-slots` НЕ перезатирает publishedAt (coalesce). reader/engagement/feed (фильтр published) консистентны. ⚠️ редполитика: miniapp показывает ВЕСЬ пайплайн-контент БЕЗ human-ревью (одобрено; курация через админку — fast-follow).
- **Читалка `article/[slug]` была ЗАГЛУШКОЙ** (хардкод body про УСН + 500 от Next 16 Cache Components: uncached fetch вне Suspense). **Достроена:** `lib/feed.ts` тип `ArticleDetail`+`loadArticle` с **`"use cache"`** (фикс PPR-500); `components/article/article-body.tsx` рендерер блоков (paragraph/numbers/quote/callout/list) по дизайн-канону; `page.tsx` — реальные lede/«почему важно»/body/источники + hero только при реальном coverImageUrl. Проверено live + скриншот.
- **Осталось (не блокеры):** home-hero «Утренний разбор» = мок `DAILY_DIGEST`; картинки = unsplash-плейсхолдеры (VisualAgent post-M0); auth UX client-state/401-recovery (приложение gracefully без auth).

## 4. ⚠️ ЗАПУСК Mini App — шаги Константина (НЕ сделано)

1. **@BotFather** → бот, чей токен в `TELEGRAM_BOT_TOKEN` (сейчас **@Sekretar_Syrov_IP_bot** — им валидируется initData).
2. `/newapp` (или `/setmenubutton`) → **Web App URL = `https://app.pro-agent-ai.ru`** + имя/описание/иконка.
3. (опц.) `/setdomain` → `app.pro-agent-ai.ru`.
4. Открыть бота → Mini App → auth сам (initData→JWT) → лента+читалка+engagement живьём.
- ⚠️ dedicated `@x10_daily_bot` → обновить `TELEGRAM_BOT_TOKEN` в .env.production + deploy.sh (иначе initData HMAC не сойдётся).

## 5. ⚠️ Грабли (повторяемые — учти ВСЕ)

- **Деплой/рестарт ТОЛЬКО** `docker compose --env-file .env.production …` или `./deploy.sh` (иначе `${VAR}` пустые → crash-loop).
- **api.telegram.org из РФ — только IPv6 + глобальный адрес только DHCPv6; рестарт systemd-networkd сбрасывает IPv6 → watchdog лечит /2мин; `netplan apply` НЕЛЬЗЯ.**
- **Новый env-ключ воркера → в `readBindingsFromEnv` (bindings.ts).** Новый id Inngest → re-sync `PUT pipeline:8787/inngest` из api.
- **DeepSeek-агенты идут через `response_format json_object`** (НЕ tool_choice) + reasoning-headroom + timeout 420s (см. define-agent.ts).
- **⚠️ GIT-КОЛЛИЗИЯ:** спавн-таск (failed-runs-ledger чип) сел в ту же рабочую папку (не worktree), ветка `fix/pipeline-failed-runs-ledger` на origin (f2b2aed+7b146e2, в main НЕ влита). **При активном спавн-таске в той же папке — работать через отдельный worktree.**
- НЕ создавай/удаляй VM циклично (Timeweb fraud-detection).

## 6. Следующая сессия (по выбору Константина)

- **P1 — Платежи (revenue loop):** Telegram Stars + ЮKassa → создание `subscriptions` → замкнуть paywall (read-side готов) + пометить premium-контент (`isPaid`). Скилл `yookassa-timeweb-payments`. Нужны: shopId/secret ЮKassa + тарифы. **Путь к первым платящим.**
- **Остаток miniapp:** real digest-hero (`/v1/digests/latest` когда будут выпуски), dedicated бот, PostHog (аналитика — желательно с запуском).
- **Отложенные находки:** failed-раны в $-ledger (есть ветка спавн-таска — решить, мержить ли); снизить $-потолок $15→$5 после замера v4-flash; Inngest step-латентность на 4-мин агентах.

---

## Стартовый промпт для новой сессии

> Прочитай (в порядке): `docs/handoffs/handoff-session-24.md` + memory `project_x10_deploy_state.md` + CLAUDE.md. Timeweb-инфра — skill `timeweb-telegram-deploy`.
>
> Состояние: M0 + walking-skeleton ЖИВ+АВТОНОМЕН на Timeweb. **HEAD кода `aaa8850`.** Автономный постинг 4/день в Telegram на DeepSeek **v4-flash** (Claude off; reasoning-модель, hardening в define-agent: response_format + headroom + timeout 420s). IPv6 захардён watchdog'ом. **Miniapp ЖИВ+наполнен** (app.pro-agent-ai.ru, лента 40+, читалка достроена) — готов к запуску в BotFather (не сделан, см. handoff §4).
>
> Session 24: (A) DeepSeek verified + переключён на v4-flash с adversarial-ревью+hardening; (B) IPv6-инцидент устранён + self-healing watchdog; (C) M1/P0 «добить miniapp» — persist-as-published (лента 8→40+), читалка достроена (реальный body + фикс PPR-500).
>
> **ЗАДАЧА (выбор Константина):** P1 — платежи (Stars+ЮKassa→subscriptions→paywall-замок, путь к первым платящим) ЛИБО остаток miniapp (real digest-hero / dedicated бот / PostHog) ЛИБО запуск Mini App в BotFather. ⚠️ Грабли: деплой только deploy.sh; api.telegram.org только IPv6 (watchdog, netplan apply НЕЛЬЗЯ); DeepSeek через response_format; есть несмёрженная ветка спавн-таска `fix/pipeline-failed-runs-ledger`. VM: ssh root@37.77.105.82, репо /opt/x10-daily. Режим: многоагентность ВКЛ (Workflow-ревью перед деплоем в живой контур), полная автономия. НЕ пересоздавай VM.

---

## 7. Ссылки

| Хочешь | Открой |
|---|---|
| Inventory + доступы + грабли + вся история | memory `project_x10_deploy_state.md` |
| DeepSeek-путь (response_format + headroom + timeout) | [define-agent.ts](../../packages/agents/src/define-agent.ts) |
| Цены/идентичность моделей | [constants.ts](../../packages/config/src/constants.ts) (MODEL_COSTS) |
| IPv6 watchdog | VM: `/usr/local/sbin/x10-ipv6-ensure.sh` + `systemctl status x10-ipv6-ensure.timer` |
| Лента (surface ready) | [routes/feed.ts](../../apps/api/src/routes/feed.ts) |
| persist-as-published | [persist.ts](../../apps/workers/pipeline/src/persist.ts) |
| Читалка (достроена) | [article/[slug]/page.tsx](../../apps/miniapp/src/app/article/[slug]/page.tsx) + [article-body.tsx](../../apps/miniapp/src/components/article/article-body.tsx) |
| Валидация v4-flash | [scripts/validate-v4flash.mts](../../scripts/validate-v4flash.mts) |
| Предыдущий handoff | [handoff-session-23.md](./handoff-session-23.md) |
