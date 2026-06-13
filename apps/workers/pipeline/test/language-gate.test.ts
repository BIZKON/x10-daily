import type { DraftShape } from "@x10/agents";
import { describe, expect, it } from "vitest";
import { MIN_RUSSIAN_RATIO, russianRatio } from "../src/persist";

function draft(parts: Partial<DraftShape>): DraftShape {
  return {
    tease: "",
    lede: "",
    whyItMatters: "",
    body: [],
    ...parts,
  } as DraftShape;
}

describe("russianRatio (языковой гейт)", () => {
  it("полностью английский драфт → ниже порога (halt)", () => {
    const d = draft({
      tease: "Oracle PeopleSoft breach risk: 9.6/10",
      lede: "Oracle warned of a critical PeopleSoft vulnerability allowing remote code execution.",
      whyItMatters: "This matters for any company running PeopleSoft in production.",
      body: [{ type: "paragraph", text: "Patch immediately and rotate credentials." }],
    });
    const r = russianRatio(d);
    expect(r).toBeLessThan(MIN_RUSSIAN_RATIO);
    expect(r).toBeLessThan(0.05);
  });

  it("русская tech-статья с латинскими брендами → ВЫШЕ порога (пропуск)", () => {
    const d = draft({
      tease: "Windows Server получил DoH",
      lede: "Microsoft добавила поддержку DNS over HTTPS (DoH) в Windows DNS Server.",
      whyItMatters: "Это усложнит перехват и подмену корпоративных DNS-запросов.",
      body: [
        {
          type: "paragraph",
          text: "Функция включается через групповые политики и доступна в свежем обновлении для администраторов.",
        },
      ],
    });
    const r = russianRatio(d);
    expect(r).toBeGreaterThan(MIN_RUSSIAN_RATIO);
  });

  it("чистый русский → почти 1", () => {
    const d = draft({
      tease: "Минфин поднял порог УСН",
      lede: "Порог дохода для упрощёнки вырастет до трёхсот пятидесяти миллионов рублей.",
      whyItMatters: "Малому бизнесу станет проще оставаться на льготном режиме.",
      body: [{ type: "paragraph", text: "Изменения вступают в силу со следующего года." }],
    });
    expect(russianRatio(d)).toBeGreaterThan(0.9);
  });

  it("пустой драфт → 1 (нет букв, не режем по ошибке)", () => {
    expect(russianRatio(draft({}))).toBe(1);
  });
});
