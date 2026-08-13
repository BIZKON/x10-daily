import { z } from "zod";
import { defineAgent } from "../define-agent";

/**
 * PlanAgent — контент-план на месяц (спека 13.08, реестр разрыва §3.3).
 *
 * Обещан главной фишкой тарифа за 120 тысяч: «снимает главный вопрос — о чём
 * вообще писать и что зайдёт».
 *
 * 🔴 Тема плана — это ОБЕЩАНИЕ материала. Если под ней нет фактуры в базе
 * знаний, автор получит задание «напиши что-нибудь про отрасль» и материал
 * придётся сочинять. Ровно от этой болезни лечились базой знаний: промпт не
 * рычаг, рычаг — вход. Поэтому каждая тема обязана назвать, на что опирается.
 */

/** Сколько тем собираем за прогон. Число из КП: «30 тем с датами и форматами». */
export const PLAN_TOPICS_TARGET = 30;

/**
 * Горизонт плана в днях — тридцать дней ОТ ЗАВТРА, а не календарный месяц.
 *
 * 🔴 Найдено живым прогоном 13.08: план «на текущий месяц» разложил темы с
 * первого числа, и двенадцать из тридцати оказались в прошлом — человек нажал
 * кнопку в середине месяца. Календарный месяц выглядит логично на бумаге, но
 * кнопку жмут не первого числа.
 */
export const PLAN_HORIZON_DAYS = 30;

/**
 * 🔴 Потолок задания обязан совпадать с `MAX_PROMPT` в `admin-create.ts` и с
 * `creationInputSchema.topic`. Разъедутся — план создаст задание, которое api
 * отвергнет на валидации, и человек увидит отказ без объяснения.
 */
export const MAX_TOPIC = 2000;

export const planInputSchema = z.object({
  /** Блок базы знаний по полкам. Пусто — плану не на что опереться. */
  knowledge: z.string().min(1),
  /** Заголовки за последний месяц: и повестка, и стоп-лист одновременно. */
  recentTitles: z.array(z.string()),
  categories: z
    .array(z.object({ slug: z.string(), title: z.string(), purpose: z.string() }))
    .min(1),
  /** Только РАБОЧИЕ форматы: обещать в плане недоступное нельзя. */
  formats: z.array(z.object({ slug: z.string(), title: z.string() })).min(1),
  slots: z.array(z.string()).min(1),
  /** Длина горизонта в днях. День темы отсчитывается от начала периода. */
  days: z.number().int().min(1).max(62),
  count: z.number().int().min(1).max(60),
});

export const planOutputSchema = z.object({
  items: z.array(
    z.object({
      day: z.number().int(),
      slot: z.string().optional(),
      categorySlug: z.string(),
      modeSlug: z.string(),
      title: z.string(),
      angle: z.string(),
      rationale: z.string(),
    }),
  ),
});

export const PLAN_SYSTEM = `Ты собираешь контент-план на месяц для канала компании. Тебе дают сведения о её бизнесе из базы знаний, заголовки того, что уже выходило, список рубрик, доступные форматы и расписание слотов.

КАК РАБОТАТЬ:
- Каждая тема обязана опираться на сведения о бизнесе. Отрасль вообще писать нельзя: читателю нужна эта компания, а не рынок в целом.
- В rationale коротко назови опору: на какой полке базы знаний лежит то, из чего вырастет материал. Не можешь назвать — темы не предлагай.
- Не выдумывай фактов, цифр, цен и кейсов. Тема — это обещание материала: если фактуры нет, автору придётся сочинять.
- Не повторяй то, что уже выходило (список заголовков дан). Развитие прошлой темы допустимо, пересказ — нет.
- Перемешивай рубрики: пять новостей подряд — это лента, а не план.
- Формат бери ТОЛЬКО из списка доступных. Другие форматы не существуют, даже если тема просится в карусель.
- Распредели темы по дням периода ровно, без пустых недель и без трёх тем в один день.
- Только русский язык.

ЧТО ВОЗВРАЩАЕШЬ (items):
- day — какой день ПЕРИОДА, считая от единицы: 1 — первый день плана, 2 — следующий и так далее. Это не число месяца.
- slot — время выхода из списка слотов; можно опустить.
- categorySlug — слаг рубрики ровно из списка.
- modeSlug — слаг формата ровно из списка доступных.
- title — тема так, как её увидит человек. Конкретная, без «всё о» и «полный гид».
- angle — под каким углом раскрывать: что показать, что сравнить, чем закончить.
- rationale — почему эта тема и на что опирается.`;

/**
 * Разделы, а не JSON: знания и повестка — связные тексты, внутри JSON они стали
 * бы строкой с экранированными переносами, которую модель читает хуже.
 */
export function formatPlanInput(input: z.infer<typeof planInputSchema>): string {
  const categories = input.categories
    .map((c) => `- ${c.slug} — «${c.title}». ${c.purpose}`)
    .join("\n");
  const formats = input.formats.map((f) => `- ${f.slug} — ${f.title}`).join("\n");
  const recent = input.recentTitles.length
    ? input.recentTitles.map((t) => `- ${t}`).join("\n")
    : "— ничего ещё не выходило";

  return [
    `ЗАДАНИЕ\n\nСобери ${input.count} тем на период из ${input.days} дней. День 1 — первый день периода.`,
    `СВЕДЕНИЯ О БИЗНЕСЕ\n\n${input.knowledge.trim()}`,
    `УЖЕ ВЫХОДИЛО (не повторять; это же и повестка отрасли)\n\n${recent}`,
    `РУБРИКИ\n\n${categories}`,
    `ДОСТУПНЫЕ ФОРМАТЫ\n\n${formats}`,
    `СЛОТЫ ВЫХОДА\n\n${input.slots.join(" · ")}`,
  ].join("\n\n---\n\n");
}

export type PlanTopic = {
  day: number;
  slot: string | null;
  categorySlug: string;
  modeSlug: string;
  title: string;
  angle: string;
  rationale: string;
};

/** Заголовки сравниваем без регистра и лишних пробелов — модель их не хранит. */
function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Привести план модели к пригодному виду.
 *
 * 🔴 Сборка не имеет права упасть от странного ответа: она уже оплачена.
 * Неизвестная рубрика или недоступный формат — обычный день, а не поломка.
 *
 * Правило про формат стоит отдельного слова: недоступный НЕ подменяется постом.
 * Подмена молча превратила бы «карусель» в «пост» и обещала бы человеку то,
 * чего он не увидит; отброшенная тема честнее подменённой.
 */
export function sanitizePlanItems(
  raw: z.infer<typeof planOutputSchema>,
  known: {
    categorySlugs: readonly string[];
    modeSlugs: readonly string[];
    slots: readonly string[];
    days: number;
    recentTitles: readonly string[];
  },
): { items: PlanTopic[]; dropped: number } {
  const categories = new Set(known.categorySlugs);
  const modes = new Set(known.modeSlugs);
  const slots = new Set(known.slots);
  const seen = new Set(known.recentTitles.map(normalizeTitle));

  const items: PlanTopic[] = [];
  let dropped = 0;

  for (const it of raw.items) {
    const title = it.title?.trim() ?? "";
    const angle = it.angle?.trim() ?? "";
    const key = normalizeTitle(title);

    if (
      !title ||
      !angle ||
      !categories.has(it.categorySlug) ||
      !modes.has(it.modeSlug) ||
      seen.has(key)
    ) {
      dropped++;
      continue;
    }
    seen.add(key);

    items.push({
      // Число вне месяца — арифметическая ошибка модели, а не плохая тема:
      // прижимаем к границе, тему сохраняем.
      day: Math.min(Math.max(Math.trunc(it.day) || 1, 1), known.days),
      slot: it.slot && slots.has(it.slot) ? it.slot : null,
      categorySlug: it.categorySlug,
      modeSlug: it.modeSlug,
      title: title.slice(0, 240),
      angle,
      rationale: it.rationale?.trim() ?? "",
    });
  }

  return { items, dropped };
}

/**
 * Собрать задание для `CreationAgent` из темы плана.
 *
 * Режем угол подачи, а не заголовок: заголовок — суть задания, без него
 * материал будет о чём угодно.
 */
export function buildCreationTopic(topic: { title: string; angle: string }): string {
  const head = topic.title.trim();
  const tail = topic.angle.trim();
  const full = tail ? `${head}\n\nУгол подачи: ${tail}` : head;
  if (full.length <= MAX_TOPIC) return full;

  const room = MAX_TOPIC - head.length - "\n\nУгол подачи: ".length;
  return room > 0 ? `${head}\n\nУгол подачи: ${tail.slice(0, room)}` : head.slice(0, MAX_TOPIC);
}

export const PlanAgent = defineAgent({
  name: "plan",
  tier: "SONNET",
  system: PLAN_SYSTEM,
  inputSchema: planInputSchema,
  outputSchema: planOutputSchema,
  formatInput: formatPlanInput,
  // Тридцать тем с углом подачи и обоснованием — самый длинный вывод в системе.
  maxOutputTokens: 12000,
});

export type PlanInput = z.infer<typeof planInputSchema>;
export type PlanOutput = z.infer<typeof planOutputSchema>;
