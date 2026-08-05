import { describe, expect, it } from "vitest";
import {
  HEADLINE_MAX,
  KICKER,
  SUB_MAX,
  buildPosterPrompt,
  ctaFor,
  pillarFor,
} from "../src/agents/visual";

const BASE = {
  headline: "Токены подешевели",
  sub: "Сотни миллионов за доллар",
  scene: "одна маленькая монета рядом с полем крошечных кубиков",
  category: "tools",
};

describe("buildPosterPrompt — состав кадра", () => {
  it("несёт все надписи, которые должны попасть в кадр", () => {
    const p = buildPosterPrompt(BASE);
    expect(p).toContain("Токены подешевели");
    expect(p).toContain("Сотни миллионов за доллар");
    expect(p).toContain("одна маленькая монета");
    expect(p).toContain("ИНСТРУМЕНТЫ");
  });

  it("просит брендовый знак геометрией — БЕЗ слова «логотип»", () => {
    // Замер сессии 30: формулировки «ЛОГОТИП»/«фирменный знак» ходят под
    // content_filter заметно чаще, чем описание квадрата и надписей.
    const p = buildPosterPrompt(BASE);
    expect(p).toContain("красный квадрат");
    expect(p).toContain("PA");
    expect(p).toContain("ProAgent AI");
    expect(p.toLowerCase()).not.toContain("логотип");
  });

  it("🔴 не содержит hex-кодов: модель печатает их прямо в кадре", () => {
    // Реальный брак из серии: рядом со знаком отрисовалось «#D4A24C».
    expect(buildPosterPrompt(BASE)).not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it("велит воспроизводить надписи без кавычек", () => {
    // Иначе модель рисует ёлочки, которыми ограничена строка в промпте.
    expect(buildPosterPrompt(BASE)).toContain("БЕЗ кавычек");
  });

  it("несёт запреты канона", () => {
    const p = buildPosterPrompt(BASE).toLowerCase();
    expect(p).toContain("роскошь");
    expect(p).toContain("неон");
    expect(p).toContain("лица реальных людей");
    expect(p).toContain("стоковый успех");
  });
});

describe("рекламная строка по рубрике", () => {
  it("кейсы и практика ведут на лид", () => {
    expect(ctaFor("cases")).toBe("Обсудить внедрение");
    expect(ctaFor("business")).toBe("Обсудить внедрение");
  });

  it("остальные рубрики — в контент", () => {
    expect(ctaFor("news")).toBe("Разбор в Mini App");
    expect(ctaFor("tools")).toBe("Разбор в Mini App");
    expect(ctaFor("howto")).toBe("Разбор в Mini App");
  });

  it("нужная строка попадает в промпт", () => {
    expect(buildPosterPrompt({ ...BASE, category: "cases" })).toContain("Обсудить внедрение");
    expect(buildPosterPrompt({ ...BASE, category: "news" })).toContain("Разбор в Mini App");
  });
});

describe("кикер и регистр столпа", () => {
  it("каждая рубрика рубрикатора имеет подпись", () => {
    for (const k of ["news", "cases", "howto", "tools", "business", "founder"]) {
      expect(KICKER[k]).toBeTruthy();
    }
  });

  it("кейсы — документальный кадр, обучение — схема-предмет", () => {
    expect(pillarFor("cases")).toContain("документальный");
    expect(pillarFor("howto")).toContain("схема");
  });

  it("неизвестная рубрика не роняет сборку — падаем в регистр news", () => {
    const p = buildPosterPrompt({ ...BASE, category: "нет-такой" });
    expect(p).toContain(pillarFor("news"));
    expect(p).toContain(KICKER.news);
  });
});

describe("лимиты текста в кадре", () => {
  it("лимиты заданы и разумны для чтения в ленте", () => {
    expect(HEADLINE_MAX).toBeLessThanOrEqual(30);
    expect(SUB_MAX).toBeLessThanOrEqual(50);
  });

  it("промпт собирается и при пустом подзаголовке", () => {
    expect(() => buildPosterPrompt({ ...BASE, sub: "" })).not.toThrow();
  });
});

describe("резерв места под служебную плашку Mini App", () => {
  it("промпт требует пустой верхний левый угол", () => {
    // Без резерва плашка «Глубокий разбор»/статус ложится на заголовок постера
    // и оба становятся нечитаемыми (живой баг 05.08.2026).
    const p = buildPosterPrompt(BASE);
    expect(p).toContain("ВЕРХНИЙ ЛЕВЫЙ УГОЛ");
    expect(p.toLowerCase()).toContain("пуст");
  });

  it("промпт требует надписи строго в нижней трети", () => {
    expect(buildPosterPrompt(BASE)).toContain("НИЖНЕЙ ТРЕТИ");
  });
});
