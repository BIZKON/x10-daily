import { describe, expect, it } from "vitest";
import {
  BRAND_STYLE_SUFFIX,
  PILLAR_REGISTER,
  VISUAL_NEGATIVE,
  VISUAL_STYLE,
  buildImagePrompt,
  buildVisualUserPrompt,
  pillarFor,
} from "../src/agents/visual";

describe("VisualAgent — стилевые константы (канон packages/voice/visual.md)", () => {
  it("стилевой суффикс задаёт палитру бренда и запрещает текст на картинке", () => {
    expect(BRAND_STYLE_SUFFIX).toMatch(/#E63946/i);
    expect(BRAND_STYLE_SUFFIX).toMatch(/#D4A24C/i);
    expect(BRAND_STYLE_SUFFIX.toLowerCase()).toContain("no text");
  });

  it("негатив-блок закрывает весь off-limits канона (инфобиз + ИИ-хайп)", () => {
    const n = VISUAL_NEGATIVE.toLowerCase();
    // Инфобиз-маркеры (about-me.md off-limits №1).
    expect(n).toContain("luxury");
    expect(n).toContain("lamborghini");
    expect(n).toContain("gold bars");
    // Стоковый «успех» и декоративные стрелки.
    expect(n).toContain("stock-success");
    expect(n).toContain("rising-arrow");
    // Визуальный ИИ-хайп — зеркало текстового анти-хайпа.
    expect(n).toContain("neon");
    expect(n).toContain("cyber glow");
    // Вирусный тренд NB2, лица, IP.
    expect(n).toContain("3d figurine");
    expect(n).toContain("real faces");
    expect(n).toContain("brand logos");
  });

  it("позитивная часть стиля не просит свечения — только негатив о нём говорит", () => {
    // Канон §«Что этот визуал НИКОГДА не делает» п.6: без неона и «AI-свечения».
    // Черновик плана предлагал "subtle glow" — это прямое нарушение.
    // Проверяем ИМЕННО позитивный блок: в негативе "no neon"/"no cyber glow" законны.
    expect(VISUAL_STYLE.toLowerCase()).not.toContain("glow");
    expect(VISUAL_STYLE.toLowerCase()).not.toContain("neon");
    expect(VISUAL_STYLE.toLowerCase()).not.toContain("cyber");
  });

  it("золото описано как тонкий хром, а не как материал богатства", () => {
    expect(BRAND_STYLE_SUFFIX.toLowerCase()).toContain("thin gold accent");
  });
});

describe("VisualAgent — регистр столпа по рубрике", () => {
  it("каждая рубрика рубрикатора имеет свой регистр", () => {
    for (const key of ["news", "cases", "howto", "tools", "business", "founder"]) {
      expect(PILLAR_REGISTER[key]).toBeTruthy();
    }
  });

  it("кейсы — документальный индустриальный кадр, обучение — схема-объект", () => {
    expect(PILLAR_REGISTER.cases?.toLowerCase()).toContain("documentary");
    expect(PILLAR_REGISTER.howto?.toLowerCase()).toContain("diagram");
  });
});

describe("VisualAgent — user-промпт крафта сцены", () => {
  it("user-промпт несёт суть статьи", () => {
    const p = buildVisualUserPrompt({
      tease: "WMS + ИИ: счета за 15 минут",
      lede: "Автоматизация счетов",
      category: "cases",
    });
    expect(p).toContain("WMS + ИИ: счета за 15 минут");
    expect(p).toContain("Автоматизация счетов");
  });

  it("несёт регистр столпа своей рубрики", () => {
    const p = buildVisualUserPrompt({ tease: "т", lede: "л", category: "howto" });
    expect(p).toContain(pillarFor("howto"));
  });

  it("неизвестная рубрика не роняет промпт — падаем в регистр news", () => {
    const p = buildVisualUserPrompt({ tease: "т", lede: "л", category: "нет-такой" });
    expect(p).toContain(pillarFor("news"));
  });
});

describe("VisualAgent — сборка итогового промпта (порядок канона)", () => {
  it("порядок блоков STYLE → PILLAR → SUBJECT → NEGATIVE → TECH", () => {
    const prompt = buildImagePrompt({ scene: "A single closed vault door", category: "business" });
    const iStyle = prompt.indexOf("editorial business illustration");
    const iPillar = prompt.indexOf(pillarFor("business"));
    const iSubject = prompt.indexOf("A single closed vault door");
    const iNegative = prompt.indexOf(VISUAL_NEGATIVE);
    expect(iStyle).toBeGreaterThanOrEqual(0);
    expect(iPillar).toBeGreaterThan(iStyle);
    expect(iSubject).toBeGreaterThan(iPillar);
    expect(iNegative).toBeGreaterThan(iSubject);
    // TECH идёт последним.
    expect(prompt.indexOf("16:9")).toBeGreaterThan(iNegative);
  });

  it("сцена от модели не может протащить текст в кадр — негатив всегда в хвосте", () => {
    const prompt = buildImagePrompt({
      scene: "A poster with the headline written in large letters",
      category: "news",
    });
    expect(prompt.toLowerCase()).toContain("no text");
  });
});
