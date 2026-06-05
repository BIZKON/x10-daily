import type { Env } from "@x10/config";
import type { Database } from "@x10/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M4: разделение «заклеймлен» и «доставлен». claimAlert/markAlertDelivered/
 * recordAlertAttempt мокаем (их БД-логика — в cost-ledger.test.ts); проверяем
 * оркестрацию доставки и бухгалтерию попыток. send инъектируется.
 */
const { claimAlert, markAlertDelivered, recordAlertAttempt } = vi.hoisted(() => ({
  claimAlert: vi.fn(),
  markAlertDelivered: vi.fn(async () => undefined),
  recordAlertAttempt: vi.fn(async () => undefined),
}));
vi.mock("../src/lib/cost-ledger", () => ({ claimAlert, markAlertDelivered, recordAlertAttempt }));

import { attemptDelivery, deliverOpsAlert, sendOpsAlert } from "../src/lib/ops-alert";

const db = {} as Database;
const env = {} as Env;

describe("sendOpsAlert — деградация при отсутствии конфига", () => {
  it("без TG_OPS_CHAT_ID → delivered:false с причиной", async () => {
    const res = await sendOpsAlert(
      { TG_OPS_CHAT_ID: "", TELEGRAM_BOT_TOKEN: "t" } as unknown as Env,
      "x",
    );
    expect(res).toEqual({ delivered: false, reason: expect.stringMatching(/TG_OPS_CHAT_ID/) });
  });

  it("без TELEGRAM_BOT_TOKEN → delivered:false с причиной", async () => {
    const res = await sendOpsAlert(
      { TG_OPS_CHAT_ID: "1", TELEGRAM_BOT_TOKEN: "" } as unknown as Env,
      "x",
    );
    expect(res).toEqual({ delivered: false, reason: expect.stringMatching(/TELEGRAM_BOT_TOKEN/) });
  });
});

describe("attemptDelivery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("доставлено → markAlertDelivered, без recordAlertAttempt, true", async () => {
    const send = vi.fn(async () => ({ delivered: true as const }));
    const ok = await attemptDelivery(db, env, { id: "r1", message: "m" }, send);
    expect(ok).toBe(true);
    expect(markAlertDelivered).toHaveBeenCalledWith(db, "r1");
    expect(recordAlertAttempt).not.toHaveBeenCalled();
  });

  it("провал → recordAlertAttempt(reason), без markAlertDelivered, false", async () => {
    const send = vi.fn(async () => ({ delivered: false as const, reason: "ETIMEDOUT" }));
    const ok = await attemptDelivery(db, env, { id: "r1", message: "m" }, send);
    expect(ok).toBe(false);
    expect(recordAlertAttempt).toHaveBeenCalledWith(db, "r1", "ETIMEDOUT");
    expect(markAlertDelivered).not.toHaveBeenCalled();
  });
});

describe("deliverOpsAlert — claim → попытка", () => {
  beforeEach(() => vi.clearAllMocks());

  it("конфликт claim (null) → не шлёт, claimed:false", async () => {
    claimAlert.mockResolvedValue(null);
    const send = vi.fn();
    const r = await deliverOpsAlert(
      db,
      env,
      { day: "2026-06-04", kind: "warn", spendUsd: 9.5, message: "m" },
      send,
    );
    expect(r).toEqual({ claimed: false, delivered: false });
    expect(send).not.toHaveBeenCalled();
  });

  it("claim id + доставлено → claimed+delivered; claim получил message", async () => {
    claimAlert.mockResolvedValue("r1");
    const send = vi.fn(async () => ({ delivered: true as const }));
    const r = await deliverOpsAlert(
      db,
      env,
      { day: "2026-06-04", kind: "exhausted", spendUsd: 15, message: "m" },
      send,
    );
    expect(r).toEqual({ claimed: true, delivered: true });
    expect(claimAlert).toHaveBeenCalledWith(db, "2026-06-04", "exhausted", 15, "m");
    expect(markAlertDelivered).toHaveBeenCalledWith(db, "r1");
  });

  it("claim id + провал send → claimed:true, delivered:false, попытка записана", async () => {
    claimAlert.mockResolvedValue("r1");
    const send = vi.fn(async () => ({ delivered: false as const, reason: "boom" }));
    const r = await deliverOpsAlert(
      db,
      env,
      { day: "2026-06-04", kind: "warn", spendUsd: 9.5, message: "m" },
      send,
    );
    expect(r).toEqual({ claimed: true, delivered: false });
    expect(recordAlertAttempt).toHaveBeenCalledWith(db, "r1", "boom");
  });
});
