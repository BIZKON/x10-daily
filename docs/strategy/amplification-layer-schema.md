# Amplification Layer · схема расширения F1 v2.0

> Этот документ — **дельта** к Architecture Spec v2.0. Он не заменяет F1, а добавляет 12-й, 13-й и 14-й слои к существующей системе. Идея: то, что было «one Content Object → 3 канала» (Mini App + Web + Quarterly PDF), становится «one Newsletter as source → 3 internal channels + 4 external channels через amplification».

---

## Что меняется в принципе

**Было (F1 v2.0):** Контент-фабрика производит публикации. Distribution внутри платформы.

**Стало:** Контент-фабрика производит **newsletter (центральный артефакт)**, из которого amplification-агенты выводят форматы под 4+ внешних площадки. Внутренние каналы (Mini App + Web + Quarterly PDF) — это **тоже** проекции newsletter, не наоборот.

```
                       ┌────────────────────────────────────┐
                       │       NEWSLETTER · daily 7:00 UTC   │
                       │   = single source of truth          │
                       │   (был "опц. 4-й канал" в F1)       │
                       └────────────┬───────────────────────┘
                                    │
        ┌───────────────┬───────────┼───────────┬─────────────┬───────────┐
        ▼               ▼           ▼           ▼             ▼           ▼
   ┌─────────┐   ┌──────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
   │ Mini App│   │   Web    │  │   PDF   │  │  TG Х10 │  │  Дзен   │  │   VK    │
   │ (TG/MAX)│   │  /landing│  │ quarter │  │ Рыбакова│  │ business│  │ business│
   │ внутрен │   │ external │  │ premium │  │external │  │ external│  │ external│
   └─────────┘   └──────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘
   F1 R1         F1 R2         F1 R3        NEW          NEW          NEW
```

Опционально, по решению редакции: LinkedIn для B2B-сегмента «Пульса» (банки, регуляторы) — но это **5-й канал**, не основной.

---

## Три новых агента в pipeline

Расширяют существующий конвейер из 8 агентов до **11**.

### 09 · HookGeneratorAgent
**Модель:** Claude Haiku 4.5
**Когда запускается:** после Brevity, параллельно с Distribution
**Что делает:** генерирует 6 hook-вариантов по 6 паттернам:
  1. Number-led
  2. Contrarian
  3. Transformation
  4. Authority steal
  5. Admission
  6. Future shock

Хуки сохраняются в `content_item.channels.{platform}.hook` для каждого канала отдельно. Например, для TG-канала Рыбакова — Number-led, для Дзена — Contrarian, для VK — Future shock. Решение какой паттерн куда — за SocialAmplifyAgent.

**Cost:** ~$0.001 × 30 публ./день = $0.03/мес. Пренебрежимо.

### 10 · SocialAmplifyAgent
**Модель:** Claude Sonnet 4.6
**Когда запускается:** после HookGenerator, перед публикацией во внешние каналы
**Что делает:** конвертирует Content Object в 3-4 социальных формата:

| Канал | Формат | Длина | Особенности |
|---|---|---|---|
| TG-канал Рыбакова | Пост с hook + 3 буллета + CTA в Mini App | 400-600 знаков | Voice = Рыбакова (свой voice.md) |
| Дзен | Длинная статья (расширенный лонгрид) | 1500-3000 знаков | SEO-оптимизация, длинные заголовки |
| VK Business | Пост с инфографикой | 600-900 знаков | Visual-first |
| LinkedIn (опц.) | English или RU, 200-250 слов, PAS/AIDA | 1200 chars max | Только для «Пульса» B2B |

Платформа-специфичный voice.md лежит отдельным файлом для каждой площадки (voice-tg-rybakov.md, voice-dzen.md, voice-vk.md). Это **4 разных voice**, но **один Content Object-источник**.

**Cost:** ~$0.025 × 30 публ./день = $0.75/мес × 4 платформы = $3/мес. По прежнему пренебрежимо.

### 11 · VisualAgent (опц., feature flag)
**Модель:** Gemini 2.5 Flash через WebSocket-прокси из РФ (тот же паттерн что и ElevenLabs)
**Когда запускается:** для high-engagement публикаций (после ScoreAgent оценил topic как viral-friendly)
**Что делает:**
- Whiteboard-инфографика в стиле Gemini-infographic (480K показов на 3 постах в кейсе Charlie Hills)
- Slide-by-slide carousel (5-7 слайдов) для VK / Дзен
- YouTube thumbnail (если будет YouTube-канал в будущем)

**Cost:** ~$0.04 на изображение × 10 публ./день = $12/мес.

### 12 · ScoreAgent (performance feedback loop)
**Модель:** Claude Sonnet 4.6
**Когда запускается:** раз в неделю, async
**Что делает:**
1. Пайплайн парсит engagement-метрики из TG (через Bot API getChatMember.statistics), VK API, Дзен Studio API
2. Идентифицирует топ-10% публикаций последних 30 дней
3. Извлекает паттерны: какие хуки заходят, какая длина оптимальна, какие topics over-index'ятся
4. **Обновляет confidence-пороги в `pipeline_config`** для каждой категории контента

**Это ключевое изменение по сравнению с F1.** Confidence-пороги в F1 v2.0 — статичны и калибруются вручную. После ScoreAgent — **самокалибрующиеся**.

**Cost:** ~$0.50/неделя × 4 = $2/мес. Включая Apify-style scraping (через свои API там, где доступны).

---

## Содержание Content Object расширяется

Дельта к JSON-schema на стр. 08 F1:

```json
{
  "channels": {
    "miniapp":     { "enabled": true,  "push": true, "audio_url": "..." },
    "web":         { "enabled": true,  "seo_title": "..." },
    "pdf_q":       { "enabled": false, "section": null },
    "newsletter":  { "enabled": true,  "slot": "morning_digest" },
    
    // ↓ NEW в Amplification Layer
    "tg_rybakov":  { "enabled": true,  "hook": "...", "voice": "rybakov" },
    "dzen":        { "enabled": true,  "long_form": "...", "seo_optimized": true },
    "vk":          { "enabled": true,  "post": "...", "visual_ref": "img_..." },
    "linkedin":    { "enabled": false, "pas_post": null }
  },
  
  "hooks": {                                // ↓ NEW
    "number_led":     "...",
    "contrarian":     "...",
    "transformation": "...",
    "authority":      "...",
    "admission":      "...",
    "future_shock":   "..."
  },
  
  "performance": {                          // ↓ NEW, заполняется ScoreAgent
    "tg_rybakov_engagement": null,
    "dzen_reads":           null,
    "vk_reach":             null,
    "linkedin_impressions": null
  }
}
```

---

## Content Matrix как инструмент авторов

**Новый экран в Admin Console** (8-й экран, было 7 в F1):

**`Content Matrix`** — Justin Welsh-style таблица для каждого автора Х10 Daily:
- Строки: 4 столпа из `about-me.md` (Деньги и решения / Рынки и операционка / Кадры и капитал / Сообщество и масштаб)
- Колонки: 8 форматов (Actionable / Motivational / Analytical / Contrarian / Observation / X vs Y / Present vs Future / Listicle)
- Каждая ячейка: 1 конкретное заглавие, специфичное для пары столп+формат

Это даёт **32 идеи** в одной матрице. Авторы Х10 Daily получают её при онбординге, обновляют раз в квартал.

Реализация: тот же react-component, что в analytics-dashboard у Charlie Hills — interactive table widget. Сохраняется в `content_matrix` таблице Neon, привязана к `author_id`.

---

## Cost delta vs F1 v2.0

| Слой | F1 v2.0 | + Amplification | Итого |
|---|---|---|---|
| AI pipeline | $164/мес | + $4 (HookGen + ScoreAgent) | $168 |
| Visual (Gemini) | — | + $12 | $12 |
| SocialAmplify | — | + $3 | $3 |
| **Итого AI** | **$164** | **+ $19** | **$183** |
| + Инфра (без изменений) | $200 | $0 | $200 |
| **Полный бюджет** | $364 | **+ $19/мес** | **$383/мес** |

**Прирост 5% к бюджету за 4 новых канала distribution.** Это великолепная экономика — потому что 90% работы уже сделано в pipeline, amplification — это _дешёвый формат-перевод_.

---

## Новые фазы серии v2.0

Серия v2.0 расширяется с F1-F7 до **F1-F10**:

| Фаза | Название | Добавлено в этой записке |
|---|---|---|
| F1 | Architecture Spec v2.0 | сдано (16 стр.) |
| F2 | Source Ingestion Layer detail | план в F1 |
| F3 | AI Pipeline v2 detail | план в F1 (+ интегрировать новых агентов 9-12) |
| F4 | Multi-Channel Renderers | план в F1 |
| F5 | Admin Console UX (+ 8-й экран Content Matrix) | план в F1 |
| F6 | «Пульс Х10» Module | план в F1 |
| **F8** | **Amplification Layer · external distribution** | **NEW** |
| **F9** | **Newsletter as Source of Truth · переосмысление центральности** | **NEW** |
| **F10** | **Editorial Toolkit · voice.md, Content Matrix, training для 8 авторов** | **NEW** |
| F7 | Implementation Roadmap v2 (теперь интегрирует F1–F10) | план в F1 |

F8-F10 могут идти параллельно с F2-F6, не блокируют друг друга. F7 — финальная, как и было, но теперь интегрирует все 9 фаз, а не 6.

---

## Что делать прямо сейчас

1. **Загрузить `about-me.md` + `voice.md`** в общий контекст проекта Х10 в claude.ai (или в редакторский Cowork-проект, если есть). Это foundation для ВСЕХ будущих агентов.
2. **Решение Workflow Engine** (Inngest vs Trigger.dev v3) — не блокирует amplification, но влияет на оркестрацию новых 4 агентов.
3. **Следующая сессия:** или F2 Ingestion Layer (как планировалось) или сразу F8 Amplification Layer detail (новое). Я бы рекомендовал **F8 первым** — потому что без него остальная архитектура остаётся внутренним продуктом без внешнего канала роста.
