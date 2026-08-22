import {
  type Database,
  and,
  balanceEntries,
  clientBalance,
  dealPayments,
  eq,
  isNull,
  partnerAccruals,
  partnerDeals,
  partners,
  payments,
  sql,
} from "@x10/db";
import { type Accrual, accrualsForPayment, refundAccruals, settlementPlan } from "./partner-money";

/**
 * Единственное место, где платёж считается принятым (спека 7).
 *
 * 🔴 Труба одна на пополнение баланса и на продажу завода, и точка зачисления у
 * них общая. Два платёжных кода — это две правды о деньгах: одна ветка знает про
 * чек, вторая нет; одна начисляет комиссию, вторая забывает.
 *
 * Точек ВХОДА две, и это не то же самое, что два кода:
 *
 *   карта  → вебхук ЮKassa → перепроверка → settleProviderPayment
 *   безнал → админка «деньги пришли»      → settleDealPayment
 *
 * Безнал не проходит через ЮKassa вообще (счёт юрлицу платится с расчётного
 * счёта), но комиссия партнёру с него начисляться обязана. Если бы начисление
 * жило в вебхуке, безналичная продажа считалась бы руками — то есть через раз.
 */

/** Транзакция или сама база: обе точки входа пишут одинаково. */
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Tx;

const num = (v: string | number | null): number => Number(v ?? 0);

export type SettleDealArgs = {
  dealId: string;
  amountRub: number;
  paidAt: Date;
  /** id платежа в ЮKassa. NULL у безнала — там его просто нет. */
  providerPaymentId?: string | null;
  note?: string | null;
};

export type SettleDealResult =
  | {
      ok: true;
      paymentId: string;
      /** Сколько пришло ЭТИМ платежом — нужно уведомлениям и админке. */
      paymentRub: number;
      accruals: Accrual[];
      fullyPaid: boolean;
      nextDueAt: Date | null;
    }
  | { ok: false; reason: "deal_not_found" | "deal_cancelled" | "already_settled" };

/**
 * Записывает поступивший платёж по сделке и начисляет доли.
 *
 * Всё одной транзакцией: платёж без начислений тихо теряет чужие деньги, а
 * начисление без платежа неоспоримо. Расхождение всплывает через месяц, когда
 * подробностей уже никто не помнит.
 */
export async function settleDealPayment(
  db: Executor,
  args: SettleDealArgs,
): Promise<SettleDealResult> {
  const [deal] = await db
    .select({
      id: partnerDeals.id,
      partnerId: partnerDeals.partnerId,
      amountRub: partnerDeals.amountRub,
      ratePercent: partnerDeals.ratePercent,
      status: partnerDeals.status,
      installments: partnerDeals.installments,
    })
    .from(partnerDeals)
    .where(eq(partnerDeals.id, args.dealId))
    .limit(1);

  if (!deal) return { ok: false, reason: "deal_not_found" };
  if (deal.status === "cancelled") return { ok: false, reason: "deal_cancelled" };

  // Идемпотентность по платежу провайдера: то же уведомление приходит не по
  // одному разу. Последний рубеж — уникальный индекс в базе, но проверка здесь
  // избавляет от исключения на нормальном повторе.
  if (args.providerPaymentId) {
    const [existing] = await db
      .select({ id: dealPayments.id })
      .from(dealPayments)
      .where(eq(dealPayments.providerPaymentId, args.providerPaymentId))
      .limit(1);
    if (existing) return { ok: false, reason: "already_settled" };
  }

  // Сколько по сделке было оплачено ДО этого платежа. Отдельной группировкой, а
  // не подзапросом внутри select: коррелированный подзапрос в drizzle 15.08
  // молча вернул ноль при верных данных, и партнёр увидел бы «начислено 0».
  const [paidBefore] = await db
    .select({ sum: sql<string>`coalesce(sum(${dealPayments.amountRub}), 0)` })
    .from(dealPayments)
    .where(eq(dealPayments.dealId, deal.id));

  const plan = settlementPlan({
    dealAmountRub: num(deal.amountRub),
    paidBeforeRub: num(paidBefore?.sum ?? 0),
    paymentRub: args.amountRub,
    installments: deal.installments,
    paidAt: args.paidAt,
  });

  // Продавец и наставник — только если сделка партнёрская. Продажа владельца
  // идёт тем же путём, просто начислять некому.
  let seller: { id: string; parentId: string | null; joinedAt: Date } | null = null;
  let mentor: { id: string; parentId: string | null } | null = null;

  if (deal.partnerId) {
    const [row] = await db
      .select({ id: partners.id, parentId: partners.parentId, joinedAt: partners.joinedAt })
      .from(partners)
      .where(eq(partners.id, deal.partnerId))
      .limit(1);
    seller = row ?? null;

    if (seller?.parentId) {
      const [m] = await db
        .select({ id: partners.id, parentId: partners.parentId, status: partners.status })
        .from(partners)
        .where(eq(partners.id, seller.parentId))
        .limit(1);
      // Приостановленный наставник долю не получает: участие заморожено.
      mentor = m && m.status === "active" ? { id: m.id, parentId: m.parentId } : null;
    }
  }

  const [payment] = await db
    .insert(dealPayments)
    .values({
      dealId: deal.id,
      amountRub: String(args.amountRub),
      paidAt: args.paidAt,
      providerPaymentId: args.providerPaymentId ?? null,
      note: args.note ?? null,
    })
    .returning({ id: dealPayments.id });
  if (!payment) throw new Error("не удалось записать платёж по сделке");

  const accruals =
    deal.partnerId && seller
      ? accrualsForPayment({
          payment: {
            id: payment.id,
            dealId: deal.id,
            amountRub: args.amountRub,
            paidAt: args.paidAt,
          },
          deal: {
            id: deal.id,
            partnerId: deal.partnerId,
            amountRub: num(deal.amountRub),
            ratePercent: num(deal.ratePercent),
          },
          seller,
          mentor,
        })
      : [];

  if (accruals.length > 0) {
    await db.insert(partnerAccruals).values(
      accruals.map((r) => ({
        partnerId: r.partnerId,
        paymentId: r.paymentId,
        level: r.level,
        ratePercent: String(r.ratePercent),
        amountRub: String(r.amountRub),
        reason: r.reason,
      })),
    );
  }

  // Первый платёж переводит сделку в «подписана»: деньги пришли — значит
  // договорились. Уже выставленный вручную статус не понижаем.
  await db
    .update(partnerDeals)
    .set({
      ...(deal.status === "signed"
        ? {}
        : { status: "signed" as const, signedAt: sql`coalesce(${partnerDeals.signedAt}, now())` }),
      nextDueAt: plan.nextDueAt,
    })
    .where(eq(partnerDeals.id, deal.id));

  return {
    ok: true,
    paymentId: payment.id,
    paymentRub: args.amountRub,
    accruals,
    fullyPaid: plan.fullyPaid,
    nextDueAt: plan.nextDueAt,
  };
}

export type RefundDealArgs = {
  dealId: string;
  /** Сколько вернули клиенту. Положительное число. */
  amountRub: number;
  refundedAt: Date;
  note?: string | null;
};

export type RefundDealResult =
  | {
      ok: true;
      /** Отрицательная строка платежа: к ней привязано сторно. */
      paymentId: string;
      refundRub: number;
      reversed: Accrual[];
    }
  | { ok: false; reason: "deal_not_found" | "nothing_paid" | "over_refund" };

/**
 * Возврат денег клиенту (спека 7 §11).
 *
 * Возврат в самой ЮKassa инициирует человек — автоматики не делаем. Здесь
 * фиксируется следствие: отрицательная строка `deal_payments` и отрицательные
 * начисления `reason='refund'`, всё одной транзакцией.
 *
 * 🔴 Без сторно баланс партнёра врёт в его пользу, и мы платим комиссию за
 * отменённую продажу. Полгода спустя это не восстановить: партнёр деньги уже
 * получил, а связи с возвратом в данных нет.
 *
 * Доля считается от ЧИСТОГО полученного (с учётом прежних возвратов), поэтому
 * два частичных возврата подряд обнуляют начисление ровно, а не с хвостом.
 */
export async function refundDealPayment(
  db: Database,
  args: RefundDealArgs,
): Promise<RefundDealResult> {
  return db.transaction(async (tx) => {
    const [deal] = await tx
      .select({ id: partnerDeals.id, partnerId: partnerDeals.partnerId })
      .from(partnerDeals)
      .where(eq(partnerDeals.id, args.dealId))
      .limit(1);
    if (!deal) return { ok: false, reason: "deal_not_found" } as const;

    // Чистое полученное: прошлые возвраты уже лежат отрицательными строками.
    const [paidRow] = await tx
      .select({ sum: sql<string>`coalesce(sum(${dealPayments.amountRub}), 0)` })
      .from(dealPayments)
      .where(eq(dealPayments.dealId, deal.id));
    const paidRub = num(paidRow?.sum ?? 0);

    if (paidRub <= 0) return { ok: false, reason: "nothing_paid" } as const;
    // Вернуть больше полученного нельзя: это опечатка в сумме, а не операция.
    if (args.amountRub > paidRub) return { ok: false, reason: "over_refund" } as const;

    const [payment] = await tx
      .insert(dealPayments)
      .values({
        dealId: deal.id,
        amountRub: String(-args.amountRub),
        paidAt: args.refundedAt,
        providerPaymentId: null,
        note: args.note ?? "возврат клиенту",
      })
      .returning({ id: dealPayments.id });
    if (!payment) throw new Error("не удалось записать возврат по сделке");

    // Начислено по сделке — чистыми, по получателям. Группировка в базе, а не
    // в коде: строк начислений на сделку может быть много (две части рассрочки
    // × два уровня × прошлые возвраты).
    const accruedRows = await tx
      .select({
        partnerId: partnerAccruals.partnerId,
        level: partnerAccruals.level,
        ratePercent: partnerAccruals.ratePercent,
        sum: sql<string>`sum(${partnerAccruals.amountRub})`,
      })
      .from(partnerAccruals)
      .innerJoin(dealPayments, eq(dealPayments.id, partnerAccruals.paymentId))
      .where(eq(dealPayments.dealId, deal.id))
      .groupBy(partnerAccruals.partnerId, partnerAccruals.level, partnerAccruals.ratePercent);

    const reversed = refundAccruals({
      paymentId: payment.id,
      paidRub,
      refundRub: args.amountRub,
      accrued: accruedRows
        .map((r) => ({
          partnerId: r.partnerId,
          level: (r.level === 1 ? 1 : 0) as 0 | 1,
          ratePercent: num(r.ratePercent),
          amountRub: num(r.sum),
        }))
        // Уже обнулённое сторнировать нечем: минус на минус вернул бы партнёру
        // деньги за возврат.
        .filter((r) => r.amountRub > 0),
    });

    if (reversed.length > 0) {
      await tx.insert(partnerAccruals).values(
        reversed.map((r) => ({
          partnerId: r.partnerId,
          paymentId: r.paymentId,
          level: r.level,
          ratePercent: String(r.ratePercent),
          amountRub: String(r.amountRub),
          reason: r.reason,
          note: args.note ?? null,
        })),
      );
    }

    return { ok: true, paymentId: payment.id, refundRub: args.amountRub, reversed } as const;
  });
}

/**
 * Зачисляет пополнение на баланс экземпляра.
 *
 * 🔴 Остаток двигаем арифметикой в самой базе, а не чтением-в-код-и-записью:
 * между чтением и записью успевает списание за прогон, и остаток разойдётся с
 * реальностью. upsert — чтобы отсутствие строки баланса не съело пополнение.
 */
async function creditTopup(
  tx: Executor,
  args: { paymentId: string; amountRub: number },
): Promise<void> {
  const amount = args.amountRub.toFixed(4);

  const [balance] = await tx
    .insert(clientBalance)
    .values({ id: true, balanceRub: amount })
    .onConflictDoUpdate({
      target: clientBalance.id,
      set: {
        balanceRub: sql`${clientBalance.balanceRub} + ${amount}::numeric`,
        updatedAt: new Date(),
      },
    })
    .returning({ after: clientBalance.balanceRub });
  if (!balance) throw new Error("не удалось сдвинуть баланс");

  await tx.insert(balanceEntries).values({
    kind: "topup",
    amountRub: amount,
    balanceAfterRub: balance.after,
    paymentId: args.paymentId,
  });
}

export type SettleProviderResult =
  | {
      ok: true;
      purpose: "topup" | "entry";
      /** Заказ, если платёж за вход. Нужен уведомлениям после транзакции. */
      dealId: string | null;
      dealResult: SettleDealResult | null;
    }
  | { ok: false; reason: "unknown_payment" | "already_credited" | "deal_missing" };

/**
 * Принимает подтверждённый шлюзом платёж: и пополнение, и вход в продукт.
 *
 * Вызывается ТОЛЬКО после перепроверки через `GET /v3/payments/{id}` — телу
 * уведомления мы не верим: адрес публичный, подписи у ЮKassa нет.
 */
export async function settleProviderPayment(
  db: Database,
  providerPaymentId: string,
): Promise<SettleProviderResult> {
  return db.transaction(async (tx) => {
    // 🔴 Зачисление ровно один раз. Условие `credited_at IS NULL` внутри самого
    // UPDATE, а не проверкой перед ним: ЮKassa повторяет уведомление, пока не
    // получит 200, и два повтора приходят одновременно.
    const [row] = await tx
      .update(payments)
      .set({ status: "succeeded", creditedAt: new Date() })
      .where(and(eq(payments.providerPaymentId, providerPaymentId), isNull(payments.creditedAt)))
      .returning({
        id: payments.id,
        purpose: payments.purpose,
        dealId: payments.dealId,
        amountRub: payments.amountRub,
      });

    if (!row) {
      // Либо платёж не наш, либо уже зачтён. Различаем ради логов: «не наш» —
      // это чужое уведомление на наш адрес, и знать об этом полезно.
      const [known] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.providerPaymentId, providerPaymentId))
        .limit(1);
      return known
        ? ({ ok: false, reason: "already_credited" } as const)
        : ({ ok: false, reason: "unknown_payment" } as const);
    }

    if (row.purpose === "topup") {
      await creditTopup(tx, { paymentId: row.id, amountRub: num(row.amountRub) });
      return { ok: true, purpose: "topup", dealId: null, dealResult: null } as const;
    }

    if (!row.dealId) {
      // CHECK в базе такого не пропустит, но если пропустит — падать транзакцией
      // лучше, чем зачесть деньги в никуда.
      throw new Error(`платёж ${row.id} с назначением entry не привязан к заказу`);
    }

    const dealResult = await settleDealPayment(tx, {
      dealId: row.dealId,
      amountRub: num(row.amountRub),
      paidAt: new Date(),
      providerPaymentId,
    });

    return { ok: true, purpose: "entry", dealId: row.dealId, dealResult } as const;
  });
}

/**
 * Отмечает платёж отменённым.
 *
 * Только пока он не зачтён: `credited_at IS NULL` защищает от гонки, где
 * «отменён» приходит после «оплачен» и стирает факт полученных денег.
 */
export async function markPaymentCanceled(
  db: Database,
  providerPaymentId: string,
): Promise<boolean> {
  const [row] = await db
    .update(payments)
    .set({ status: "canceled" })
    .where(and(eq(payments.providerPaymentId, providerPaymentId), isNull(payments.creditedAt)))
    .returning({ id: payments.id });
  return Boolean(row);
}
