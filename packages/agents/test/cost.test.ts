import { COST_PER_MTOK } from "@x10/config";
import { describe, expect, it } from "vitest";
import { calculateCostUsd } from "../src/cost";

/**
 * Цены через Timeweb AI Gateway — обновлены в session 17 (см. COST_PER_MTOK).
 * Чтобы тесты не ломались при следующей корректировке цен, ассерты идут через
 * COST_PER_MTOK значения, а не hardcoded числа.
 */

describe("calculateCostUsd", () => {
  it("Sonnet: 1M input + 100K output по тарифу из COST_PER_MTOK", () => {
    const cost = calculateCostUsd("SONNET", {
      inputTokens: 1_000_000,
      outputTokens: 100_000,
    });
    const expected =
      COST_PER_MTOK.SONNET.input + (100_000 * COST_PER_MTOK.SONNET.output) / 1_000_000;
    expect(cost).toBeCloseTo(expected, 5);
  });

  it("Haiku 1k in / 500 out — копейки", () => {
    const cost = calculateCostUsd("HAIKU", { inputTokens: 1000, outputTokens: 500 });
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.05);
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
    const inputRate = COST_PER_MTOK.SONNET.input;
    const inputPart = (10_000 * inputRate) / 1_000_000;
    const cachedInputPart = (10_000 * inputRate * 0.1) / 1_000_000;
    expect(noCache - withCache).toBeCloseTo(inputPart - cachedInputPart, 6);
  });

  it("Opus дороже Sonnet", () => {
    const opus = calculateCostUsd("OPUS", { inputTokens: 1000, outputTokens: 500 });
    const sonnet = calculateCostUsd("SONNET", { inputTokens: 1000, outputTokens: 500 });
    expect(opus).toBeGreaterThan(sonnet);
  });
});
