import { describe, expect, it } from "vitest";
import {
  MAX_TOPIC,
  PLAN_HORIZON_DAYS,
  PLAN_SYSTEM,
  PLAN_TOPICS_TARGET,
  buildCreationTopic,
  formatPlanInput,
  planInputSchema,
  sanitizePlanItems,
} from "../src/agents/plan";

/**
 * PlanAgent — контент-план на месяц (спека 13.08).
 *
 * Проверяем решения, а не формулировки. Главное: план — это обещание материалов,
 * и тема без опоры на базу знаний превращается в задание «напиши что-нибудь про
 * отрасль». Ровно от этого лечились базой знаний в сессии 35.
 */

const INPUT = {
  knowledge: "## Цены и условия\nСтраховой взнос от 150 ₽…",
  recentTitles: ["Склад считает остатки сам"],
  categories: [{ slug: "business", title: "Практика", purpose: "Как это работает в деле." }],
  formats: [{ slug: "post", title: "Пост" }],
  slots: ["09:30", "12:30"],
  days: PLAN_HORIZON_DAYS,
  count: PLAN_TOPICS_TARGET,
};

describe("канон промпта", () => {
  it("🔴 темы обязаны опираться на базу знаний, а не на отрасль вообще", () => {
    expect(PLAN_SYSTEM).toMatch(/база знаний|сведени|полк/i);
    expect(PLAN_SYSTEM).toMatch(/отрасл/i);
  });

  it("🔴 не выдумывать фактов: тема — это обещание материала", () => {
    // Тема, под которую нет фактуры, заставит писать сочинение.
    expect(PLAN_SYSTEM).toMatch(/не выдумыв|не сочин/i);
  });

  it("требует объяснить, почему эта тема", () => {
    // `rationale` — то, ради чего план покупают: он показывает опору на прайс и
    // возражения клиента, а не общие слова.
    expect(PLAN_SYSTEM).toMatch(/rationale/);
  });

  it("запрещает повторять уже вышедшее", () => {
    expect(PLAN_SYSTEM).toMatch(/уже выход|повтор/i);
  });

  it("велит перемешивать рубрики", () => {
    // Пять новостей подряд — это лента, а не план.
    expect(PLAN_SYSTEM).toMatch(/рубрик/i);
  });

  it("форматы только из списка доступных", () => {
    expect(PLAN_SYSTEM).toMatch(/формат/i);
    expect(PLAN_SYSTEM).toMatch(/списк|доступн/i);
  });

  it("только русский язык", () => {
    expect(PLAN_SYSTEM).toMatch(/русск/i);
  });
});

describe("вход агента", () => {
  it("🔴 без знаний план не собирается", () => {
    // Гейт стоит и в маршруте, но схема — последний рубеж: план из пустоты это
    // тридцать тем про отрасль вообще, за которые клиент заплатит.
    expect(planInputSchema.safeParse({ ...INPUT, knowledge: "" }).success).toBe(false);
  });

  it("без рубрик и без форматов раскладывать некуда", () => {
    expect(planInputSchema.safeParse({ ...INPUT, categories: [] }).success).toBe(false);
    expect(planInputSchema.safeParse({ ...INPUT, formats: [] }).success).toBe(false);
  });

  it("обычный вход проходит", () => {
    expect(planInputSchema.safeParse(INPUT).success).toBe(true);
  });
});

describe("formatPlanInput", () => {
  it("кладёт знания, повестку, рубрики, форматы и слоты", () => {
    const text = formatPlanInput(INPUT);
    expect(text).toContain("Страховой взнос");
    expect(text).toContain("Склад считает остатки сам");
    expect(text).toContain("business");
    expect(text).toContain("post");
    expect(text).toContain("09:30");
  });

  it("говорит агенту, сколько тем нужно", () => {
    expect(formatPlanInput(INPUT)).toContain(String(PLAN_TOPICS_TARGET));
  });

  it("🔴 план считается от первого дня периода, а не от первого числа месяца", () => {
    // Находка живого прогона 13.08: план на «календарный месяц» разложил 12 тем
    // из 30 в прошлое, потому что человек нажал кнопку 13-го числа.
    expect(PLAN_HORIZON_DAYS).toBe(30);
    expect(PLAN_SYSTEM).toMatch(/день ПЕРИОДА/);
    // Отрицание в промпте стоит намеренно: модель сама тянется к числу месяца.
    expect(PLAN_SYSTEM).toMatch(/не число месяца/i);
  });
});

describe("sanitizePlanItems — ответ модели не должен ронять сборку", () => {
  const known = {
    categorySlugs: ["business", "cases"],
    modeSlugs: ["post"],
    slots: ["09:30", "12:30"],
    days: 30,
    recentTitles: ["Склад считает остатки сам"],
  };

  const item = (over: Record<string, unknown> = {}) => ({
    day: 5,
    slot: "09:30",
    categorySlug: "business",
    modeSlug: "post",
    title: "Сколько стоит застраховать груз на 2 миллиона",
    angle: "Показать сетку взносов по диапазонам.",
    rationale: "На полке «Цены» лежит полная сетка взносов.",
    ...over,
  });

  it("нормальная тема проходит целиком", () => {
    const r = sanitizePlanItems({ items: [item()] }, known);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.day).toBe(5);
  });

  it("🔴 неизвестная рубрика не роняет сборку — тема отбрасывается", () => {
    const r = sanitizePlanItems({ items: [item({ categorySlug: "vydumannaya" }), item()] }, known);
    expect(r.items).toHaveLength(1);
    expect(r.dropped).toBe(1);
  });

  it("🔴 недоступный формат отбрасывается, а не подменяется постом", () => {
    // Иначе план молча обещает карусель, которой нет, — та самая дыра между
    // обещанным и построенным, из-за которой заведён реестр.
    const r = sanitizePlanItems({ items: [item({ modeSlug: "carousel" })] }, known);
    expect(r.items).toHaveLength(0);
    expect(r.dropped).toBe(1);
  });

  it("пустая тема или пустой угол подачи отбрасываются", () => {
    const r = sanitizePlanItems({ items: [item({ title: "  " }), item({ angle: "" })] }, known);
    expect(r.items).toHaveLength(0);
  });

  it("🔴 повтор уже вышедшего не проходит", () => {
    // Стоп-лист — единственная защита от плана, который пересказывает прошлый
    // месяц. Сравнение без учёта регистра и лишних пробелов.
    const r = sanitizePlanItems(
      { items: [item({ title: "  склад СЧИТАЕТ остатки сам " })] },
      known,
    );
    expect(r.items).toHaveLength(0);
  });

  it("дубли внутри самого плана схлопываются", () => {
    const r = sanitizePlanItems({ items: [item(), item()] }, known);
    expect(r.items).toHaveLength(1);
  });

  it("день вне горизонта прижимается к границе, а тема остаётся", () => {
    // Модель ошибётся числом, но тема может быть хорошей — терять её из-за
    // арифметики глупо. `day` — порядковый день ПЕРИОДА, а не число месяца:
    // план начинается завтра, а не первого числа (находка живого прогона 13.08).
    expect(sanitizePlanItems({ items: [item({ day: 44 })] }, known).items[0]?.day).toBe(30);
    expect(sanitizePlanItems({ items: [item({ day: 0 })] }, known).items[0]?.day).toBe(1);
  });

  it("слот не из расписания обнуляется, тема остаётся", () => {
    const r = sanitizePlanItems({ items: [item({ slot: "23:15" })] }, known);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.slot).toBeNull();
  });
});

describe("buildCreationTopic — тема уезжает в CreationAgent", () => {
  it("🔴 потолок совпадает с тем, что принимает раздел «Создать»", () => {
    // Разъедутся — план создаст задание, которое api отвергнет на валидации, и
    // человек увидит отказ без объяснения.
    expect(MAX_TOPIC).toBe(2000);
  });

  it("несёт и тему, и угол подачи", () => {
    const topic = buildCreationTopic({ title: "Страховка груза", angle: "Сетка взносов." });
    expect(topic).toContain("Страховка груза");
    expect(topic).toContain("Сетка взносов");
  });

  it("🔴 длинный угол режется, но заголовок остаётся целым", () => {
    // Заголовок — суть задания; терять его ради угла подачи нельзя.
    const topic = buildCreationTopic({ title: "Страховка груза", angle: "а".repeat(5000) });
    expect(topic.length).toBeLessThanOrEqual(MAX_TOPIC);
    expect(topic).toContain("Страховка груза");
  });
});
