import { describe, expect, it } from "vitest";
import { calculateCostUsd } from "../src/cost";

describe("calculateCostUsd", () => {
  it("Sonnet: 1M input + 100K output = $4.50", () => {
    const cost = calculateCostUsd("SONNET", {
      inputTokens: 1_000_000,
      outputTokens: 100_000,
    });
    expect(cost).toBeCloseTo(3 + 1.5, 5);
  });

  it("Haiku 1k in / 500 out — копейки", () => {
    const cost = calculateCostUsd("HAIKU", { inputTokens: 1000, outputTokens: 500 });
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.01);
  });

  it("Prompt cache hit удешевляет input в 10×", () => {
    const noCache = calculateCostUsd("SONNET", {
      inputTokens: 10_000,
      outputTokens: 1000,
    });
    const withCache = calculateCostUsd("SONNET", {
      inputTokens: 10_000,
      outputTokens: 1000,
      cachedInputTokens: 10_000,
    });
    expect(withCache).toBeLessThan(noCache);
    const inputPart = (10_000 * 3) / 1_000_000;
    const cachedInputPart = (10_000 * 3 * 0.1) / 1_000_000;
    expect(noCache - withCache).toBeCloseTo(inputPart - cachedInputPart, 6);
  });

  it("Opus дороже Sonnet", () => {
    const opus = calculateCostUsd("OPUS", { inputTokens: 1000, outputTokens: 500 });
    const sonnet = calculateCostUsd("SONNET", { inputTokens: 1000, outputTokens: 500 });
    expect(opus).toBeGreaterThan(sonnet);
  });
});
