import { MENTOR_BONUS_MONTHS, MENTOR_RATE_PERCENT, PARTNER_RATE_PERCENT } from "@x10/config";
import { describe, expect, it } from "vitest";
import {
  accrualsForPayment,
  dueNowRub,
  mentorStillEarns,
  partnerBalance,
  payoutBreakdown,
  refundAccruals,
  settlementPlan,
  wouldMakeCycle,
} from "../src/lib/partner-money";

/**
 * Деньги партнёрской программы (спека 14.08).
 *
 * Здесь считаются чужие деньги, поэтому проверяем не «работает ли функция», а
 * ровно те правила, которые владелец назвал вслух: 20% продавцу с каждого
 * платежа, 5% наставнику сверх, срок наставнических, и то, что ставка берётся
 * из сделки, а не из текущих настроек.
 */

const SELLER = { id: "p-seller", parentId: null, joinedAt: "2026-01-10T00:00:00.000Z" };
const MENTOR = { id: "p-mentor", parentId: null, joinedAt: "2025-06-01T00:00:00.000Z" };

/** Сделка на «Линию»: 350 000 ₽, ставка зафиксирована в момент сделки. */
const DEAL = { id: "d-1", partnerId: SELLER.id, amountRub: 350_000, ratePercent: 20 };

const PAYMENT = {
  id: "pay-1",
  dealId: DEAL.id,
  amountRub: 350_000,
  paidAt: "2026-08-14T10:00:00.000Z",
};

describe("начисление с платежа клиента", () => {
  it("продавец получает свой процент от ПЛАТЕЖА", () => {
    const rows = accrualsForPayment({ payment: PAYMENT, deal: DEAL, seller: SELLER, mentor: null });
    const sale = rows.find((r) => r.reason === "sale");
    expect(sale?.partnerId).toBe(SELLER.id);
    expect(sale?.amountRub).toBe(70_000);
  });

  it("🔴 рассрочка: доля идёт с каждой части, а не с суммы договора", () => {
    // Решение владельца: «не платим раньше, чем получили сами». Если считать от
    // суммы договора, партнёр получит всё вперёд — за деньги, которых у нас нет.
    const half = { ...PAYMENT, amountRub: 175_000 };
    const first = accrualsForPayment({ payment: half, deal: DEAL, seller: SELLER, mentor: null });
    const second = accrualsForPayment({
      payment: { ...half, id: "pay-2" },
      deal: DEAL,
      seller: SELLER,
      mentor: null,
    });

    expect(first[0]?.amountRub).toBe(35_000);
    expect(second[0]?.amountRub).toBe(35_000);
    expect((first[0]?.amountRub ?? 0) + (second[0]?.amountRub ?? 0)).toBe(70_000);
  });

  it("🔴 ставка берётся ИЗ СДЕЛКИ, а не из текущих настроек", () => {
    // Поднимем процент через полгода — старые сделки обязаны считаться по
    // прежней ставке, иначе отчёт партнёру задним числом изменится.
    const oldDeal = { ...DEAL, ratePercent: 15 };
    const rows = accrualsForPayment({
      payment: PAYMENT,
      deal: oldDeal,
      seller: SELLER,
      mentor: null,
    });
    expect(rows[0]?.amountRub).toBe(52_500);
    expect(rows[0]?.ratePercent).toBe(15);
    expect(PARTNER_RATE_PERCENT).toBe(20); // настройка другая — и это не влияет
  });

  it("наставник получает свою долю СВЕРХ, продавец не теряет ничего", () => {
    const seller = { ...SELLER, parentId: MENTOR.id };
    const rows = accrualsForPayment({ payment: PAYMENT, deal: DEAL, seller, mentor: MENTOR });

    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.reason === "sale")?.amountRub).toBe(70_000);
    const bonus = rows.find((r) => r.reason === "mentor");
    expect(bonus?.partnerId).toBe(MENTOR.id);
    expect(bonus?.amountRub).toBe(17_500);
    expect(bonus?.level).toBe(1);
  });

  it("🔴 глубина строго один уровень: наставник наставника не получает ничего", () => {
    // Иначе это дерево без дна, а мы договаривались об одном уровне.
    const seller = { ...SELLER, parentId: MENTOR.id };
    const mentorWithOwnMentor = { ...MENTOR, parentId: "p-grand" };
    const rows = accrualsForPayment({
      payment: PAYMENT,
      deal: DEAL,
      seller,
      mentor: mentorWithOwnMentor,
    });
    expect(rows.map((r) => r.partnerId)).toEqual([SELLER.id, MENTOR.id]);
  });

  it("без наставника начисление одно", () => {
    const rows = accrualsForPayment({ payment: PAYMENT, deal: DEAL, seller: SELLER, mentor: null });
    expect(rows).toHaveLength(1);
  });
});

describe("срок наставнических", () => {
  const joined = new Date("2026-01-10T00:00:00.000Z");

  it("в первый год наставник получает", () => {
    expect(mentorStillEarns(joined, new Date("2026-08-14T00:00:00.000Z"))).toBe(true);
  });

  it("🔴 после срока — нет: иначе это бессрочная рента", () => {
    // Привёл человека однажды и получаешь через пять лет, ничего не делая.
    expect(mentorStillEarns(joined, new Date("2027-02-01T00:00:00.000Z"))).toBe(false);
    expect(MENTOR_BONUS_MONTHS).toBe(12);
  });

  it("день в день срок ещё действует", () => {
    expect(mentorStillEarns(joined, new Date("2027-01-10T00:00:00.000Z"))).toBe(true);
  });

  it("истёкший срок убирает начисление наставнику из платежа", () => {
    const seller = { ...SELLER, parentId: MENTOR.id };
    const late = { ...PAYMENT, paidAt: "2027-06-01T00:00:00.000Z" };
    const rows = accrualsForPayment({ payment: late, deal: DEAL, seller, mentor: MENTOR });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reason).toBe("sale");
  });
});

describe("баланс партнёра", () => {
  it("к выплате = начислено минус выплачено", () => {
    const b = partnerBalance(
      [{ amountRub: 70_000 }, { amountRub: 17_500 }],
      [{ amountRub: 50_000 }],
    );
    expect(b.accruedRub).toBe(87_500);
    expect(b.paidRub).toBe(50_000);
    expect(b.dueRub).toBe(37_500);
  });

  it("🔴 возврат уменьшает начисленное, а не увеличивает долг", () => {
    // Клиент вернул деньги — сеть не должна на этом заработать.
    const b = partnerBalance([{ amountRub: 70_000 }, { amountRub: -70_000 }], []);
    expect(b.accruedRub).toBe(0);
    expect(b.dueRub).toBe(0);
  });

  it("пустой партнёр показывает нули, а не пустоту", () => {
    expect(partnerBalance([], [])).toEqual({ accruedRub: 0, paidRub: 0, dueRub: 0 });
  });
});

describe("защита дерева от цикла", () => {
  const tree = [
    { id: "a", parentId: null },
    { id: "b", parentId: "a" },
    { id: "c", parentId: "b" },
  ];

  it("🔴 нельзя сделать наставником своего же потомка", () => {
    // A→B→C, и если C станет наставником A, начисление пойдёт по кругу.
    expect(wouldMakeCycle(tree, "a", "c")).toBe(true);
  });

  it("нельзя стать наставником самому себе", () => {
    expect(wouldMakeCycle(tree, "a", "a")).toBe(true);
  });

  it("обычная привязка проходит", () => {
    expect(wouldMakeCycle(tree, "c", "a")).toBe(false);
  });
});

describe("ставка наставника", () => {
  it("совпадает с решением владельца", () => {
    expect(MENTOR_RATE_PERCENT).toBe(5);
  });
});

/* ── Магазин (спека 7) ────────────────────────────────────────────────────── */

describe("settlementPlan — что делать со сделкой после платежа", () => {
  const paidAt = new Date("2026-08-15T10:00:00Z");

  it("полная оплата закрывает сделку и не назначает следующий срок", () => {
    const plan = settlementPlan({
      dealAmountRub: 350000,
      paidBeforeRub: 0,
      paymentRub: 350000,
      installments: 1,
      paidAt,
    });
    expect(plan.fullyPaid).toBe(true);
    expect(plan.nextDueAt).toBeNull();
  });

  it("первая половина рассрочки назначает срок второй через месяц", () => {
    const plan = settlementPlan({
      dealAmountRub: 350000,
      paidBeforeRub: 0,
      paymentRub: 175000,
      installments: 2,
      paidAt,
    });
    expect(plan.fullyPaid).toBe(false);
    expect(plan.nextDueAt?.toISOString()).toBe("2026-09-15T10:00:00.000Z");
  });

  it("вторая половина закрывает сделку и снимает срок", () => {
    const plan = settlementPlan({
      dealAmountRub: 350000,
      paidBeforeRub: 175000,
      paymentRub: 175000,
      installments: 2,
      paidAt,
    });
    expect(plan.fullyPaid).toBe(true);
    expect(plan.nextDueAt).toBeNull();
  });

  it("🔴 копеечный недобор не держит сделку открытой", () => {
    // Иначе сделка на 350 000 вечно висит недоплаченной из-за округления
    // эквайринга, и партнёр видит «ждём деньги», когда клиент всё заплатил.
    const plan = settlementPlan({
      dealAmountRub: 350000,
      paidBeforeRub: 175000,
      paymentRub: 174999.995,
      installments: 2,
      paidAt,
    });
    expect(plan.fullyPaid).toBe(true);
  });

  it("переплата тоже закрывает сделку", () => {
    const plan = settlementPlan({
      dealAmountRub: 180000,
      paidBeforeRub: 0,
      paymentRub: 200000,
      installments: 1,
      paidAt,
    });
    expect(plan.fullyPaid).toBe(true);
    expect(plan.nextDueAt).toBeNull();
  });
});

describe("payoutBreakdown — сколько партнёр получит на руки", () => {
  it("самозанятому платим всё начисленное: налог его", () => {
    expect(payoutBreakdown(70000, "self_employed")).toEqual({
      grossRub: 70000,
      ndflRub: 0,
      netRub: 70000,
      statusKnown: true,
    });
  });

  it("ИП — так же, налог его", () => {
    expect(payoutBreakdown(70000, "entrepreneur")).toEqual({
      grossRub: 70000,
      ndflRub: 0,
      netRub: 70000,
      statusKnown: true,
    });
  });

  it("🔴 у физлица удерживаем НДФЛ из его же 20%", () => {
    // Решение владельца 15.08: 20% — сумма ДО налога. Взносы СФР платим сверх,
    // но это наш расход, и партнёру он не показывается.
    expect(payoutBreakdown(70000, "individual")).toEqual({
      grossRub: 70000,
      ndflRub: 9100,
      netRub: 60900,
      statusKnown: true,
    });
  });

  it("статус не спросили — считаем без удержания, но помечаем это", () => {
    // Показать физлицу «на руки 70 000» и выплатить 60 900 хуже, чем честно
    // сказать «уточните статус».
    const b = payoutBreakdown(70000, null);
    expect(b.netRub).toBe(70000);
    expect(b.statusKnown).toBe(false);
  });

  it("копейки округляются до двух знаков", () => {
    expect(payoutBreakdown(1234.57, "individual")).toEqual({
      grossRub: 1234.57,
      ndflRub: 160.49,
      netRub: 1074.08,
      statusKnown: true,
    });
  });
});

describe("dueNowRub — сколько платить прямо сейчас", () => {
  it("без рассрочки — вся сумма", () => {
    expect(dueNowRub({ amountRub: 180000, paidRub: 0, installments: 1 })).toBe(180000);
  });

  it("🔴 рассрочка показывает половину, а не весь договор", () => {
    // Увидев 350 000 там, где ждали 175 000, человек уходит думать.
    expect(dueNowRub({ amountRub: 350000, paidRub: 0, installments: 2 })).toBe(175000);
  });

  it("после первой части — остаток", () => {
    expect(dueNowRub({ amountRub: 350000, paidRub: 175000, installments: 2 })).toBe(175000);
  });

  it("оплачено полностью — платить нечего", () => {
    expect(dueNowRub({ amountRub: 350000, paidRub: 350000, installments: 2 })).toBe(0);
    expect(dueNowRub({ amountRub: 350000, paidRub: 400000, installments: 2 })).toBe(0);
  });

  it("частичная оплата не превращается в требование сверх договора", () => {
    // Клиент заплатил 300 000 из 350 000 — остаётся 50 000, а не ещё 175 000.
    expect(dueNowRub({ amountRub: 350000, paidRub: 300000, installments: 2 })).toBe(50000);
  });
});

describe("refundAccruals — сторно комиссии при возврате клиенту", () => {
  /** Что уже начислено по сделке: 20% продавцу и 5% наставнику с 350 000 ₽. */
  const ACCRUED = [
    { partnerId: SELLER.id, level: 0 as const, ratePercent: 20, amountRub: 70_000 },
    { partnerId: MENTOR.id, level: 1 as const, ratePercent: 5, amountRub: 17_500 },
  ];

  it("полный возврат обнуляет начисленное: сторно ровно на минус ту же сумму", () => {
    const rows = refundAccruals({
      paymentId: "ref-1",
      paidRub: 350_000,
      refundRub: 350_000,
      accrued: ACCRUED,
    });

    expect(rows).toEqual([
      {
        paymentId: "ref-1",
        partnerId: SELLER.id,
        level: 0,
        ratePercent: 20,
        amountRub: -70_000,
        reason: "refund",
      },
      {
        paymentId: "ref-1",
        partnerId: MENTOR.id,
        level: 1,
        ratePercent: 5,
        amountRub: -17_500,
        reason: "refund",
      },
    ]);
  });

  it("частичный возврат режет пропорционально полученному", () => {
    const rows = refundAccruals({
      paymentId: "ref-2",
      paidRub: 350_000,
      refundRub: 175_000,
      accrued: ACCRUED,
    });

    expect(rows.map((r) => r.amountRub)).toEqual([-35_000, -8_750]);
  });

  it("🔴 наставник сторнируется, даже если срок его бонуса уже истёк", () => {
    // Начислено — значит выплачено или будет выплачено. Возврат забирает то,
    // что реально начислили, а не то, что начислили бы сегодня заново.
    const rows = refundAccruals({
      paymentId: "ref-3",
      paidRub: 350_000,
      refundRub: 350_000,
      accrued: ACCRUED,
    });

    expect(rows.some((r) => r.partnerId === MENTOR.id && r.amountRub === -17_500)).toBe(true);
  });

  it("сделка без партнёра — сторнировать нечего", () => {
    expect(
      refundAccruals({ paymentId: "ref-4", paidRub: 350_000, refundRub: 350_000, accrued: [] }),
    ).toEqual([]);
  });

  it("денег по сделке не приходило — на ноль не делим", () => {
    expect(
      refundAccruals({ paymentId: "ref-5", paidRub: 0, refundRub: 10_000, accrued: ACCRUED }),
    ).toEqual([]);
  });

  it("🔴 возврат больше полученного не сторнирует больше начисленного", () => {
    // Защита от опечатки в сумме: иначе баланс партнёра уходит в минус глубже,
    // чем он когда-либо зарабатывал, и мы требуем с него денег.
    const rows = refundAccruals({
      paymentId: "ref-6",
      paidRub: 100_000,
      refundRub: 500_000,
      accrued: [{ partnerId: SELLER.id, level: 0, ratePercent: 20, amountRub: 20_000 }],
    });

    expect(rows[0]?.amountRub).toBe(-20_000);
  });

  it("копейки округляются до двух знаков", () => {
    const rows = refundAccruals({
      paymentId: "ref-7",
      paidRub: 10_000,
      refundRub: 3_333,
      accrued: [{ partnerId: SELLER.id, level: 0, ratePercent: 20, amountRub: 2_000 }],
    });

    expect(rows[0]?.amountRub).toBe(-666.6);
  });
});
