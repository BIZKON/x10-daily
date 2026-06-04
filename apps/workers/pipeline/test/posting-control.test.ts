import { isPostingPaused, mskHour } from "@x10/db";
import type { PostingControl } from "@x10/db";
import { describe, expect, it } from "vitest";

/**
 * Чистая логика стоп-крана автопостинга (session 20). БД не нужна.
 */

function ctrl(p: Partial<PostingControl>): PostingControl {
  return {
    id: "global",
    paused: false,
    quietEnabled: false,
    quietStartHour: 21,
    quietEndHour: 9,
    updatedAt: new Date(0),
    ...p,
  };
}

/** Date с заданным часом МСК (UTC+3). */
function atMskHour(h: number): Date {
  return new Date(Date.UTC(2026, 5, 4, (h - 3 + 24) % 24, 0, 0));
}

describe("mskHour", () => {
  it("UTC+3", () => {
    expect(mskHour(new Date("2026-06-04T18:00:00Z"))).toBe(21);
    expect(mskHour(new Date("2026-06-04T21:30:00Z"))).toBe(0);
    expect(mskHour(atMskHour(9))).toBe(9);
  });
});

describe("isPostingPaused", () => {
  it("ручная пауза приоритетнее всего", () => {
    const s = isPostingPaused(ctrl({ paused: true, quietEnabled: false }), atMskHour(12));
    expect(s).toEqual({ paused: true, reason: "manual" });
  });

  it("тихие часы выключены → не на паузе в любой час", () => {
    expect(isPostingPaused(ctrl({ quietEnabled: false }), atMskHour(3)).paused).toBe(false);
  });

  it("окно 21→09 (через полночь): 23 и 03 — пауза, 12 — нет", () => {
    const c = ctrl({ quietEnabled: true, quietStartHour: 21, quietEndHour: 9 });
    expect(isPostingPaused(c, atMskHour(23)).reason).toBe("quiet-hours");
    expect(isPostingPaused(c, atMskHour(3)).reason).toBe("quiet-hours");
    expect(isPostingPaused(c, atMskHour(12)).paused).toBe(false);
  });

  it("границы окна 21→09: 21 включительно (пауза), 09 эксклюзивно (нет), 20 — нет", () => {
    const c = ctrl({ quietEnabled: true, quietStartHour: 21, quietEndHour: 9 });
    expect(isPostingPaused(c, atMskHour(21)).paused).toBe(true);
    expect(isPostingPaused(c, atMskHour(9)).paused).toBe(false);
    expect(isPostingPaused(c, atMskHour(20)).paused).toBe(false);
  });

  it("обычное окно 01→06 (без переноса): 03 — пауза, 07 и 00 — нет", () => {
    const c = ctrl({ quietEnabled: true, quietStartHour: 1, quietEndHour: 6 });
    expect(isPostingPaused(c, atMskHour(3)).paused).toBe(true);
    expect(isPostingPaused(c, atMskHour(7)).paused).toBe(false);
    expect(isPostingPaused(c, atMskHour(0)).paused).toBe(false);
  });

  it("start===end → окно игнорируется (страховка от круглосуточной паузы)", () => {
    const c = ctrl({ quietEnabled: true, quietStartHour: 10, quietEndHour: 10 });
    expect(isPostingPaused(c, atMskHour(10)).paused).toBe(false);
  });
});
