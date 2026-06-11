import { describe, expect, it } from "vitest";
import {
  buildSyntheticDigest,
  SYNTHETIC_DIGEST_INTRO,
  todayMskIsoDate,
  type HeroArticle,
} from "../src/routes/digests";

const ARTICLE: HeroArticle = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "usn-350mln",
  tease: "Новый порог УСН 350 млн: кому грозит, кому выгодно",
  lede: "Разобрали с налоговым адвокатом.",
  category: "taxes",
};

describe("buildSyntheticDigest", () => {
  it("оборачивает топ-статьи в форму DailyDigest с synthetic-флагом", () => {
    const digest = buildSyntheticDigest({
      issueDate: "2026-06-11",
      topArticles: [ARTICLE],
    });
    expect(digest).toStrictEqual({
      issueDate: "2026-06-11",
      intro: SYNTHETIC_DIGEST_INTRO,
      rybakovTake: null,
      premiumTeaser: null,
      tomorrow: null,
      sentAt: null,
      synthetic: true,
      topArticles: [ARTICLE],
    });
  });

  it("НЕ выдумывает rybakovTake/premiumTeaser (анти-инфобиз, ToV)", () => {
    const digest = buildSyntheticDigest({ issueDate: "2026-06-11", topArticles: [] });
    expect(digest.rybakovTake).toBeNull();
    expect(digest.premiumTeaser).toBeNull();
    // intro — без атрибуции/цитат.
    expect(digest.intro).not.toMatch(/Рыбаков|«|»/);
  });

  it("сохраняет порядок топ-статей (он значимый для дайджеста)", () => {
    const a = { ...ARTICLE, id: "a", slug: "a" };
    const b = { ...ARTICLE, id: "b", slug: "b" };
    const digest = buildSyntheticDigest({ issueDate: "2026-06-11", topArticles: [b, a] });
    expect(digest.topArticles.map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("todayMskIsoDate (МСК = UTC+3)", () => {
  it("возвращает московский календарный день для дневного UTC", () => {
    // 11 июня 12:00 UTC = 15:00 МСК → 2026-06-11
    expect(todayMskIsoDate(new Date("2026-06-11T12:00:00Z"))).toBe("2026-06-11");
  });

  it("late-вечер UTC уже следующий день в МСК", () => {
    // 10 июня 21:30 UTC = 11 июня 00:30 МСК → 2026-06-11
    expect(todayMskIsoDate(new Date("2026-06-10T21:30:00Z"))).toBe("2026-06-11");
  });

  it("ранний вечер UTC ещё тот же день в МСК", () => {
    // 11 июня 20:00 UTC = 11 июня 23:00 МСК → 2026-06-11
    expect(todayMskIsoDate(new Date("2026-06-11T20:00:00Z"))).toBe("2026-06-11");
  });

  it("полночь UTC = 03:00 МСК того же дня", () => {
    expect(todayMskIsoDate(new Date("2026-06-11T00:00:00Z"))).toBe("2026-06-11");
  });
});
