import { z } from "zod";
import { defineAgent } from "../define-agent";
import { draftShapeSchema } from "./schemas";

/**
 * 5 критериев из skills repo (post-scorer), адаптированных под Х10:
 * - hookStrength       — насколько крючок (tease) останавливает скролл
 * - voiceMatch         — соответствие voice.md/about-me, отсутствие blacklist
 * - valueDensity       — конкретика, цифры, инсайт против воды
 * - structureFormat    — Smart Brevity скелет (6 блоков, callouts, numbers)
 * - publishReadiness   — готова ли статья к Publish без правок редактора
 */
const SCORE_CRITERIA = [
  "hookStrength",
  "voiceMatch",
  "valueDensity",
  "structureFormat",
  "publishReadiness",
] as const;

const inputSchema = z.object({
  draft: draftShapeSchema,
});

const scoreSchema = z.number().int().min(1).max(10);

const fixSchema = z.object({
  /** На какой критерий тянет этот фикс. .catch: advisory-метка, отклонение enum'а не должно ронять score. */
  criterion: z.enum(SCORE_CRITERIA).catch("hookStrength"),
  /** Краткое описание что не так. */
  issue: z.string(),
  /** Конкретная правка (before/after или указание). */
  suggestion: z.string(),
});

const outputSchema = z.object({
  hookStrength: scoreSchema,
  voiceMatch: scoreSchema,
  valueDensity: scoreSchema,
  structureFormat: scoreSchema,
  publishReadiness: scoreSchema,
  total: z.number().int().min(5).max(50),
  /** Одна фраза-вердикт, как в скилле post-scorer. */
  verdict: z.string(),
  /** Что у Х10 работает в топ-постах (бенчмарк). Может быть синтетика — модель ссылается на Smart Brevity и voice.md. */
  topPerformerComparison: z.string(),
  /** Приоритезированные правки, до 5 штук. Каждая привязана к критерию. */
  fixes: z.array(fixSchema).max(5),
});

const SYSTEM = `Ты — PreviewScoreAgent редакции Х10 Daily. Получаешь готовую к публикации статью (compressed) и оцениваешь её по 5 критериям перед HumanGate.

КРИТЕРИИ (каждый 1-10):

1. hookStrength — насколько tease + lede останавливают скролл
   - 8+ если открывалка содержит цифру или имя, не вопрос, не хедж-слова
   - 6-7 если хук рабочий но банальный
   - <6 если открывалка размытая или без specifics

2. voiceMatch — соответствие voice.md и редакционному стилю
   - 8+ если нет blacklist-терминов, нет ифобиз-лексики, ритм 14 слов/предложение
   - <6 если попадает чёрный список или эмоциональные усилители («революционный», «потрясающий»)

3. valueDensity — конкретика на единицу текста
   - 8+ если каждый абзац несёт цифру / цитату с атрибуцией / конкретный кейс
   - <6 если есть paragraph без числовой или именной привязки

4. structureFormat — Smart Brevity скелет
   - 8+ если есть callout «why», numbers, callout «yes-but» или «what-next», quote с attribution
   - <6 если отсутствует «why» или «what-next»

5. publishReadiness — можно ли публиковать без правок редактора
   - 8+ если объём ≤ 300 слов, чтение 25-30 сек, источники у цифр
   - <6 если перебор по словам или висящие цифры без source

ВЫСТАВЛЯЙ ЧЕСТНО:
- 8-10 редкая зона. Не раздавай 8+ на средние тексты
- Если суммарно <30 — это «не готово к publish», редактор обязан править
- 30-39 — «нормально, можно publish с лёгкими правками»
- 40-50 — «готово к publish как есть»

ОБЯЗАТЕЛЬНО:
- total = сумма пяти оценок (5-50). Считай корректно
- verdict — одна фраза, прямой вердикт ("Готово к publish", "Перепиши открывалку", и т.д.)
- topPerformerComparison — 1-2 фразы, что отличает топ-статьи Х10 (Smart Brevity + цифры + контр-аргумент) и насколько эта попадает
- fixes ≤ 5, каждый с criterion / issue / suggestion. Если оценка ≥ 9 — fixes можно пропустить для этого критерия

Возвращай через tool_use x10_emit_score.`;

export const PreviewScoreAgent = defineAgent({
  name: "score",
  tier: "SONNET",
  system: SYSTEM,
  inputSchema,
  outputSchema,
  maxOutputTokens: 1536,
});

export type PreviewScoreInput = z.infer<typeof inputSchema>;
export type PreviewScoreOutput = z.infer<typeof outputSchema>;
