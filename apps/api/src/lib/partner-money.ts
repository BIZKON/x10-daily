import { MENTOR_BONUS_MONTHS, MENTOR_RATE_PERCENT } from "@x10/config";

/**
 * Деньги партнёрской программы (спека 14.08).
 *
 * 🔴 Вынесено в чистые функции намеренно: это чужие деньги. Ошибка здесь не
 * падает с ошибкой, а тихо занижает или завышает выплату — и обнаруживается,
 * когда партнёр пересчитает вручную и придёт спорить. Всё, что можно проверить
 * без базы, проверяется без базы.
 */

export type PartnerNode = {
  id: string;
  /** Кто пригласил. `null` — пришёл сам. */
  parentId: string | null;
  /** Когда зарегистрировался: от этой даты живёт срок наставнических. */
  joinedAt?: string | Date;
};

export type DealRef = {
  id: string;
  partnerId: string;
  amountRub: number;
  /** Копия ставки на момент сделки — источник истины для начисления. */
  ratePercent: number;
};

export type PaymentRef = {
  id: string;
  dealId: string;
  amountRub: number;
  paidAt: string | Date;
};

export type AccrualReason = "sale" | "mentor" | "refund";

export type Accrual = {
  paymentId: string;
  partnerId: string;
  /** 0 — продавец, 1 — наставник. Третьего уровня нет по решению владельца. */
  level: 0 | 1;
  ratePercent: number;
  amountRub: number;
  reason: AccrualReason;
};

/** Рубли с копейками: доли процентов не должны копиться в невидимых хвостах. */
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Получает ли наставник свою долю с этой продажи.
 *
 * 🔴 Срок считается от регистрации ПРИВЕДЁННОГО партнёра, а не от даты сделки:
 * год даётся на то, чтобы наставник окупил своё участие, а не на каждую сделку
 * заново.
 */
export function mentorStillEarns(sellerJoinedAt: string | Date, at: string | Date): boolean {
  const joined = sellerJoinedAt instanceof Date ? sellerJoinedAt : new Date(sellerJoinedAt);
  const now = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(joined.getTime()) || Number.isNaN(now.getTime())) return false;

  const deadline = new Date(joined);
  deadline.setMonth(deadline.getMonth() + MENTOR_BONUS_MONTHS);
  // День в день срок ещё действует: граница трактуется в пользу партнёра.
  return now.getTime() <= deadline.getTime();
}

/**
 * Что начисляется с одного платежа клиента.
 *
 * Продавцу — доля по ставке ИЗ СДЕЛКИ. Наставнику — сверх, из нашей маржи, и
 * только пока не истёк срок. Возвращает готовые строки, а не сумму: у платежа
 * несколько получателей, и каждому нужна своя запись с зафиксированной ставкой.
 */
export function accrualsForPayment(args: {
  payment: PaymentRef;
  deal: DealRef;
  seller: PartnerNode;
  mentor: PartnerNode | null;
}): Accrual[] {
  const { payment, deal, seller, mentor } = args;

  const rows: Accrual[] = [
    {
      paymentId: payment.id,
      partnerId: seller.id,
      level: 0,
      ratePercent: deal.ratePercent,
      amountRub: round2((payment.amountRub * deal.ratePercent) / 100),
      reason: "sale",
    },
  ];

  // Наставник — ровно один уровень вверх. Наставник наставника не получает
  // ничего: дерево без дна мы строить не договаривались.
  if (mentor && seller.parentId === mentor.id) {
    const joined = seller.joinedAt;
    if (joined && mentorStillEarns(joined, payment.paidAt)) {
      rows.push({
        paymentId: payment.id,
        partnerId: mentor.id,
        level: 1,
        ratePercent: MENTOR_RATE_PERCENT,
        amountRub: round2((payment.amountRub * MENTOR_RATE_PERCENT) / 100),
        reason: "mentor",
      });
    }
  }

  return rows;
}

/**
 * Сколько партнёру начислено, выплачено и сколько мы должны.
 *
 * Баланс НЕ хранится колонкой: сохранённое вычисляемое значение расходится с
 * фактом при первой же правке задним числом. Возврат приходит отрицательной
 * строкой начисления — поэтому суммируем как есть, без фильтров по знаку.
 */
export function partnerBalance(
  accruals: readonly { amountRub: number }[],
  payouts: readonly { amountRub: number }[],
): { accruedRub: number; paidRub: number; dueRub: number } {
  const accruedRub = round2(accruals.reduce((s, a) => s + a.amountRub, 0));
  const paidRub = round2(payouts.reduce((s, p) => s + p.amountRub, 0));
  return { accruedRub, paidRub, dueRub: round2(accruedRub - paidRub) };
}

/**
 * Замкнётся ли дерево, если `parentId` станет наставником `childId`.
 *
 * 🔴 Цикл — не теория: A приглашает B, ссорятся, B «переподписывает» A на себя,
 * и начисление ходит по кругу, пока не кончится память. Проверка при записи
 * дешевле разбирательства по деньгам.
 */
export function wouldMakeCycle(
  partners: readonly PartnerNode[],
  childId: string,
  parentId: string,
): boolean {
  if (childId === parentId) return true;

  const parentOf = new Map(partners.map((p) => [p.id, p.parentId]));
  let cursor: string | null | undefined = parentId;
  const seen = new Set<string>();

  while (cursor) {
    if (cursor === childId) return true;
    if (seen.has(cursor)) return true; // цикл уже есть в данных — не углубляем
    seen.add(cursor);
    cursor = parentOf.get(cursor) ?? null;
  }
  return false;
}
