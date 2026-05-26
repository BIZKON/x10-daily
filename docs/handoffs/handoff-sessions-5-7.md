# Handoff · Х10 Daily · Серия v2.0 · Полный саммари
## Состояние на 26 мая 2026 · конец сессии 7

---

## 1. Проект

**Клиент:** Игорь Рыбаков, движение Х10 (~30 885 кламперов), газета «Бизнес-Практика».

**Цель:** превращение PDF-газеты в ежедневное мини-апп-медиа **«Х10 Daily»** — Telegram + MAX + email newsletter + ежеквартальная печатная версия + 4 внешних канала amplification (TG Рыбакова, Дзен, VK, опц. LinkedIn).

**Позиционирование:** жёсткий уход от инфобиза. Ключевой контекст — кейс Шабутдинова/Like Центр (7 лет, 31.10.2025). Х10 Daily = профессиональное деловое медиа, а не мотивационная рассылка.

**Аудитория:** действующие предприниматели 30-55 лет с выручкой ₽20M-₽2B/год. Три подсегмента:
- «Региональные собственники» (60%) — Ухта, Краснодар, Самара
- «Технологические предприниматели» (25%) — Москва/СПб, IT/digital
- «Эксит-готовящиеся» (15%) — продали или планируют

---

## 2. Серия v1.0 · ЗАКРЫТА (сессии 1-3)

7 документов + 1 прототип + 1 story-template:

| Документ | Файл | Страниц |
|---|---|---|
| Strategy | `/mnt/project/X10Strategyv1_0.pdf` | ~14 |
| ToV Guidelines | `/mnt/project/X10ToVGuidelinesv1_0.pdf` | ~12 |
| Финмодель 12 мес | `/mnt/project/Х10_Daily_финмодель_12мес.xlsx` | — |
| Rewrites (4 кейса до/после) | `/mnt/project/X10Rewritesv1_0.pdf` | ~10 |
| Tech Roadmap | `/mnt/project/X10TechRoadmapv1_0.pdf` | ~12 |
| Competitive Analysis | `/mnt/project/X10CompetitiveAnalysisv1_0.pdf` | ~14 |
| Editorial Migration | `/mnt/project/X10EditorialMigrationv1_0.pdf` | ~12 |
| Прототип Mini App | `/mnt/project/Х10_News_Mini-App___Interactive_Prototype.tsx` | — |
| Story template Васляева | `/mnt/project/x10_redesign_vaslyaev_story_after.html` | — |

---

## 3. Серия v2.0 · ВЕРХНЯЯ АРХИТЕКТУРА ЗАКРЫТА (сессии 4-7)

### 3.1 Сданные документы

| Фаза | Документ | Файл (outputs) | Страниц | Размер |
|---|---|---|---|---|
| F1 | Architecture Spec v2.0 | `X10-Architecture-Spec-v2.0.pdf` | 16 | 2.6 MB |
| — | about-me.md (foundation) | `about-me.md` | — | 6.8 KB |
| — | voice.md (foundation) | `voice.md` | — | 13.4 KB |
| — | amplification-layer-schema.md | `amplification-layer-schema.md` | — | 12.3 KB |
| F8 | Amplification Layer v2.0 | `X10-Amplification-Layer-v2.0.pdf` | 16 | 2.97 MB |
| F9 | Newsletter Foundation v2.0 | `X10-Newsletter-Foundation-v2.0.pdf` | 16 | 2.59 MB |
| F10 | Editorial Toolkit v2.0 | `X10-Editorial-Toolkit-v2.0.pdf` | 12 | 1.97 MB |

**Итого:** ~60 страниц спецификации + 3 foundation MD-файла

### 3.2 Также в проекте (project knowledge)

| Файл | Что |
|---|---|
| `X10_News_Mini-App__Community_Research__Media_Benchmark_and_React_Mockups.md` | Benchmark + Research |
| `handoff-документ__от_25_мая_2026_года_1_сессия...` | Handoff сессии 1 |
| `__Handoff___Х10_Daily__сессия_2__25_мая_2026_` | Handoff сессии 2 |
| `Handoff-X10-Daily-Session-3-26-May-2026.md` | Handoff сессии 3 |

---

## 4. Архитектурные решения (принятые, зафиксированные в документах)

### F1 Architecture Spec v2.0

| # | Решение | Зафиксировано |
|---|---|---|
| D1 | TG только public Bot API (не User API, не Telethon) | F1 p.03 |
| D2 | Полный автопилот + post-hoc audit (не approval gate) | F1 p.05 |
| D3 | Только ежеквартальный PDF (не monthly) | F1 p.04 |
| D4 | Pipeline 8 агентов: SourceCurator → Draft → Numbers → FactCheck → ToV-Agent → Brevity → Audio → Distribution | F1 p.05-08 |
| D5 | FactCheck = Claude Opus (самый дорогой, самый точный) | F1 p.06 |
| D6 | Audio = ElevenLabs через WebSocket-прокси из РФ (Render.com) | F1 p.07 |
| D7 | Neon Postgres + pgvector для Content Store | F1 p.09 |
| D8 | PostHog self-hosted для метрик | F1 p.10 |
| D9 | Бюджет F1: ~$364/мес (AI $164 + инфра $200) | F1 p.14 |

### F8 Amplification Layer

| # | Решение | Зафиксировано |
|---|---|---|
| D10 | 4+1 внешних канала: TG Рыбакова (приоритет), Дзен (SEO), VK (visual), LinkedIn (опц. от M6) | F8 p.03 |
| D11 | Newsletter = центральный артефакт (переосмыслен из «опц. 4-й канал» в F1) | F8 p.04 |
| D12 | Pipeline расширен до 12 агентов: +HookGen (09), +SocialAmplify (10), +VisualAgent (11), +ScoreAgent (12) | F8 p.05 |
| D13 | HookGenerator: 6 паттернов (number-led, contrarian, transformation, authority, admission, future-shock) | F8 p.06 |
| D14 | Voice-multiplexing: 5 voice.md файлов (Х10 + Рыбакова + Дзен + VK + LinkedIn) | F8 p.10 |
| D15 | ScoreAgent: самокалибрующиеся confidence-пороги (weekly async) | F8 p.09 |
| D16 | VisualAgent: Gemini 2.5 Flash через WS-прокси, fallback YandexART | F8 p.08 |
| D17 | Юр.маркировка: 3 режима (редакционный ~95% / партнёрский ~4% / спонсорский ~1%) | F8 p.15 |
| D18 | F8 cost delta: +$19-55/мес (с или без LinkedIn) → итого $383-419/мес | F8 p.14 |

### F9 Newsletter Foundation

| # | Решение | Зафиксировано |
|---|---|---|
| D19 | Email = product, не канал. Самодостаточный 5-7 мин чтения | F9 p.02 |
| D20 | 7 секций (6 daily + Тренд недели по пн): Big story, Numbers, Quick hits (3), Пульс Х10, Watch list, End/CTA, Тренд недели | F9 p.03 |
| D21 | 4 типа выпуска: Daily (пн-пт) + Saturday deep-dive + Tuesday tools + Monthly community | F9 p.04 |
| D22 | 3 сегментированных версии (по Quick hits слоту) — одна рассылка с 3 вариантами | F9 p.05 |
| D23 | NewsletterAssembleAgent = 13-й агент в pipeline, запуск 06:00 МСК daily | F9 p.06 |
| D24 | Subject line A/B: HookGen 2 кандидата → Resend split 10% → winner на 90% | F9 p.07 |
| D25 | Resend как email-провайдер ($0→$20→$80/мес по мере масштаба) | F9 p.08 |
| D26 | Double opt-in обязательный (152-ФЗ, штраф ₽75K-700K за нарушение) | F9 p.10 |
| D27 | Premium тиры: Free / Daily Premium ₽490/мес / Pulse B2B ₽4990/мес | F9 p.11 |
| D28 | Окупаемость email-слоя: на 22 paid подписчиках (~800 free база) | F9 p.14 |

### F10 Editorial Toolkit

| # | Решение | Зафиксировано |
|---|---|---|
| D29 | 8 авторов, 5 уровней (L1 junior → L5 senior) | F10 p.03 |
| D30 | about-author-{name}.md для каждого автора (foundation для AI) | F10 p.04 |
| D31 | Content Matrix 4×8 = 32 идеи/мес/автор (Justin Welsh метод) | F10 p.05 |
| D32 | L1-L3: voice.md Х10 общий. L4-L5: собственный voice-{name}.md | F10 p.04 |
| D33 | Daily workflow: 4-часовой продуктивный день (9:00-13:00) | F10 p.07 |
| D34 | 18-пунктовый review checklist обязателен перед submit | F10 p.08 |
| D35 | Onboarding 30-60-90 дней, 3 фазы | F10 p.09 |
| D36 | 10 common mistakes (из Rewrites v1.0 + operational data) | F10 p.10 |
| D37 | Quarterly voice calibration session — 90 мин, 5 фаз | F10 p.11 |
| D38 | Cowork-skill package: 7 скиллов в формате Charlie Hills | F10 p.12 |

---

## 5. Триггер charlie947/social-media-skills

В сессии 5 был установлен плагин `charlie947/social-media-skills` из GitHub. Прочтены ключевые скиллы:

- **voice-builder** — foundation, формат about-me.md + voice.md (с absence-signals)
- **newsletter-voice** — newsletter как source of truth
- **post-writer** — драфтинг в voice с PAS/AIDA/BAB/STAR/SLAY
- **hook-generator** — 6 паттернов двухстрочных хуков (40 знаков/строка)
- **post-formatter** — 200-250 слов, 20 строк, mobile-formatted
- **content-matrix** — Justin Welsh 4×8 = 32 идеи
- **post-scorer** — Apify scraping + engagement scoring
- **analytics-dashboard** — LinkedIn export → React dashboard

**Ключевой вывод:** Х10 v2.0 (F1) была content-production focused. Charlie Hills — content-amplification focused. Соединение дало полную фабрику: production (8 F1 агентов) + amplification (4 новых F8 агента) + newsletter as SoT (F9) + editorial ops (F10).

**Созданные foundation-файлы (3 шт.):**
- `about-me.md` — кто Х10, 4 столпа, 7 off-limits, ~270 слов
- `voice.md` — machine-readable ToV с 10 absence-signals, ~570 слов
- `amplification-layer-schema.md` — дельта-документ к F1, описание 4 новых агентов, ~1700 слов

---

## 6. Pipeline · 13 агентов (полный)

| # | Агент | Модель | Откуда |
|---|---|---|---|
| 01 | SourceCurator | Haiku 4.5 | F1 |
| 02 | DraftAgent | Sonnet 4.6 | F1 |
| 03 | NumbersAgent | Sonnet 4.6 | F1 |
| 04 | FactCheckAgent | Opus 4.6 | F1 |
| 05 | ToV-Agent | Sonnet 4.6 + RAG (voice.md) | F1 |
| 06 | BrevityAgent | Sonnet 4.6 | F1 |
| 07 | AudioAgent | ElevenLabs WS-прокси | F1 |
| 08 | DistributionAgent | Haiku 4.5 (7 каналов) | F1 → расширен F8 |
| 09 | HookGeneratorAgent | Haiku 4.5 | F8 |
| 10 | SocialAmplifyAgent | Sonnet 4.6 | F8 |
| 11 | VisualAgent | Gemini 2.5 Flash (WS-прокси) | F8 |
| 12 | ScoreAgent (weekly async) | Sonnet 4.6 | F8 |
| 13 | NewsletterAssembleAgent (daily async) | Sonnet 4.6 | F9 |
| — | AuditAgent (daily async, 20% sample) | Sonnet 4.6 | F1 |

---

## 7. 7 каналов distribution

| # | Канал | Источник | Voice |
|---|---|---|---|
| 1 | Mini App (TG + MAX) | F1 | voice.md Х10 |
| 2 | Web Landing | F1 | voice.md Х10 |
| 3 | Quarterly PDF | F1 | voice.md Х10 |
| 4 | Newsletter (email) | F9 | voice.md Х10 |
| 5 | TG-канал Рыбакова | F8 | voice-rybakov.md |
| 6 | Дзен | F8 | voice-dzen.md |
| 7 | VK Business | F8 | voice-vk.md |
| (8) | LinkedIn (опц., от M6) | F8 | voice-linkedin.md |

---

## 8. Бюджет · итоговый

| Слой | Cost/мес | Источник |
|---|---|---|
| AI pipeline (агенты 01-08) | $164 | F1 |
| AI amplification (агенты 09-12) | $19 | F8 |
| AI newsletter (агент 13 + A/B) | $4 | F9 |
| Дзен Studio Premium | $10 | F8 |
| Resend Scale (M6+) | $80 | F9 |
| Stripe fees | $8-25 | F9 |
| LinkedIn посредник (опц.) | $30 | F8 |
| Инфраструктура (CF, Neon, PostHog, WS-proxy) | $193 | F1 |
| **Итого (без LinkedIn)** | **~$478/мес** | — |
| **Итого (с LinkedIn)** | **~$508/мес** | — |

---

## 9. Фазы серии v2.0 · статус

| Фаза | Статус | Страниц |
|---|---|---|
| F1 · Architecture Spec v2.0 | ✅ СДАНО | 16 |
| Foundation files (about-me, voice, schema) | ✅ СДАНО | 3 MD |
| F8 · Amplification Layer | ✅ СДАНО | 16 |
| F9 · Newsletter Foundation | ✅ СДАНО | 16 |
| F10 · Editorial Toolkit | ✅ СДАНО | 12 |
| **F2 · Ingestion Layer detail** | ○ не начата | ~14-16 |
| **F3 · Pipeline v3 detail (13 agents)** | ○ не начата | ~14 |
| **F4 · Multi-Channel Renderers** | ○ не начата | ~12 |
| **F5 · Admin Console UX** | ○ не начата | ~14 |
| **F6 · «Пульс Х10» Module** | ○ не начата | ~12 |
| **F7 · Implementation Roadmap v2 (final)** | ○ не начата | ~14 |

---

## 10. Открытые вопросы · 10 шт.

### Критические (блокируют implementation)

| # | Вопрос | Блокирует | Кто решает |
|---|---|---|---|
| Q1 | Workflow Engine: Inngest vs Trigger.dev v3 | F2, F3 | Tech Lead |
| Q2 | SLA с PR-командой Рыбакова: post-hoc vs pre-publish | F8.2 (TG канал) | PR + Editor-in-Chief |
| Q3 | ОРД-оператор: Яндекс ОРД / VK ОРД / Sber ОРД | F8 маркировка | Editor-in-Chief |
| Q4 | Stripe + ЮKassa или только одно | F9.5 | Finance |
| Q5 | voice-rybakov.md: пишет наша команда или внешний voice-консультант | F8.1 | Editor-in-Chief + PR |

### Важные (не блокируют, но влияют)

| # | Вопрос | Когда нужно решить | Кто |
|---|---|---|---|
| Q6 | Pricing premium-tier: ₽290 vs ₽490 vs ₽790 | До F9.5 (M5) | Product + Finance |
| Q7 | Saturday deep-dive + Tuesday tools: отдельные подписки или default | До F9.3 | Editor-in-Chief |
| Q8 | Дзен Premium на юр.лицо Х10 или физлицо редактора | До F8.3 | Finance |
| Q9 | Кто пишет welcome email-серию (7 писем) | До F9.3 | Editor-in-Chief |
| Q10 | Доля revenue от premium в pipeline-улучшения vs Х10 OKR | До M6 | Finance + Board |

---

## 11. Дизайн-канон PDF (для воспроизведения в будущих документах)

- A4 borderless, padding 14mm × 16mm × 12mm
- Шрифты: Manrope 700/800 (заголовки), Inter 400-700 (текст), JetBrains Mono 500/700 (числа/код)
- Цвета: `--red: #E63946` · `--gold: #D4A24C` · `--steel: #1F2937` · `--surface: #FAFAF7` · `--border: #E5E2DA` · `--green: #2F7D3E` · `--amber: #C77700` · `--blue: #2563A6`
- Без градиентов в смысловых блоках
- Editor-note: сплошной --steel фон + белый текст + золотые акценты на `<b>`
- Footer: `X10-{DOC-NAME}-v2.0.pdf · {section}` слева, `{NN} / {total}` справа
- Header: `X10 DAILY · {DOC NAME} · {PHASE}` слева (с красным tag), `{NN · SECTION}` справа
- ASCII-имя файла обязательно (кириллица ломает превью)
- Готовые CSS-классы: .card, .card.dark, .card-red/-gold/-green/-blue, .pill (+ pill-red/gold/steel/green/amber/blue), .grid-2/-3/-4, .bignum, .kv, .code, .editor-note, .toc-row, .eyebrow, .hook-card, .checklist, .author-card, .email-mock

---

## 12. Конвейер PDF-рендеринга

Все PDF рендерятся через Playwright headless Chromium:
- HTML → CSS (все шрифты через Google Fonts CDN) → `convert.py` → PDF
- Chromium binary: `/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`
- Скрипт `convert.py` одинаков для всех фаз, различаются HTML_IN и PDF_OUT пути
- Все рабочие директории: `/home/claude/f8/`, `/home/claude/f9/`, `/home/claude/f10/`

---

## 13. Рекомендация следующего шага

**F7 Implementation Roadmap v2** — финальный интегрирующий документ серии v2.0. Берёт F1-F10, выкладывает на единый timeline M0-M12 с зависимостями, milestones, ресурсами, бюджетом и open questions привязанными к датам решений.

**Альтернативы:**
- F2 Ingestion detail — если приоритет tech depth
- F3 Pipeline v3 detail — если приоритет AI-конфигурация

**Стартовый промпт:**
> Продолжаем серию v2.0 Х10 Daily. Сдано: F1 + foundation files + F8 + F9 + F10 (верхняя архитектура закрыта, ~60 стр. + 3 MD). Следующая фаза — [F2 / F3 / F7]. Та же дизайн-парадигма. Бюджет: ~$478/мес. Pipeline: 13 агентов + AuditAgent. 7 каналов distribution. 8 авторов, 5 уровней.
