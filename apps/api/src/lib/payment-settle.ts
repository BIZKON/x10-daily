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
import { type Accrual, accrualsForPayment, settlementPlan } from "./partner-money";

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
    accruals,
    fullyPaid: plan.fullyPaid,
    nextDueAt: plan.nextDueAt,
  };
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
  | { ok: true; purpose: "topup" | "entry"; dealResult: SettleDealResult | null }
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
      return { ok: true, purpose: "topup", dealResult: null } as const;
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

    return { ok: true, purpose: "entry", dealResult } as const;
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
