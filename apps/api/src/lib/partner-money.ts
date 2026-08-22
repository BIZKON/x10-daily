import { MENTOR_BONUS_MONTHS, MENTOR_RATE_PERCENT, NDFL_RATE_PERCENT } from "@x10/config";

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
 * Сторно комиссии при возврате денег клиенту (спека 7 §11).
 *
 * 🔴 Считаем от того, что РЕАЛЬНО начислено по сделке, а не пересчитываем
 * комиссию заново от возвращаемой суммы. Пересчёт врёт в двух местах сразу:
 * ставку сделки могли поправить после начисления, а наставнический срок мог
 * истечь — и тогда сторно наставника не появилось бы вовсе, хотя деньги ему
 * начислили. Возврат забирает ровно то, что дали.
 *
 * Без сторно баланс партнёра врёт в его пользу, и мы платим за отменённую
 * продажу.
 */
export function refundAccruals(args: {
  /** Отрицательная строка платежа, к которой привязывается сторно. */
  paymentId: string;
  /** Сколько по сделке получено всего, до возврата. Положительное число. */
  paidRub: number;
  /** Сколько возвращаем клиенту. Положительное число. */
  refundRub: number;
  /** Начисленное по этой сделке — как лежит в базе. */
  accrued: readonly {
    partnerId: string;
    level: 0 | 1;
    ratePercent: number;
    amountRub: number;
  }[];
}): Accrual[] {
  const { paymentId, paidRub, refundRub, accrued } = args;

  // Денег не приходило — сторнировать нечего, и делить на ноль тоже не на что.
  if (paidRub <= 0 || refundRub <= 0) return [];

  // Доля возврата от полученного. Больше единицы не бывает: опечатка в сумме
  // иначе увела бы баланс партнёра глубже в минус, чем он вообще заработал.
  const share = Math.min(refundRub / paidRub, 1);

  return accrued.map((a) => ({
    paymentId,
    partnerId: a.partnerId,
    level: a.level,
    ratePercent: a.ratePercent,
    amountRub: -round2(a.amountRub * share),
    reason: "refund" as const,
  }));
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

/* ── Магазин (спека 7) ────────────────────────────────────────────────────── */

export type PartnerTaxStatus = "self_employed" | "entrepreneur" | "individual";

/**
 * Что делать со сделкой после того, как пришёл платёж.
 *
 * Отделено от записи в базу намеренно: «оплачено ли полностью» и «когда ждать
 * остаток» — это решения, а не SQL, и ошибка в них видна только через месяц,
 * когда клиент не платит вторую часть, потому что срок никто не назначил.
 */
export function settlementPlan(args: {
  dealAmountRub: number;
  /** Сколько по этой сделке уже было оплачено ДО текущего платежа. */
  paidBeforeRub: number;
  paymentRub: number;
  /** Частей оплаты по договорённости: 1 или 2. */
  installments: number;
  paidAt: Date;
}): { fullyPaid: boolean; nextDueAt: Date | null } {
  const paidTotal = args.paidBeforeRub + args.paymentRub;

  // 🔴 Допуск в копейку. Без него сделка на 350 000 висит недоплаченной из-за
  // округления, а партнёр видит «ждём деньги» при полностью заплатившем клиенте.
  const fullyPaid = paidTotal >= args.dealAmountRub - 0.01;

  if (fullyPaid || args.installments < 2) {
    return { fullyPaid, nextDueAt: null };
  }

  // Вторая часть — через месяц от фактической оплаты первой, а не от даты
  // заказа: отсчёт от того, что произошло, спорить не о чем.
  const next = new Date(args.paidAt);
  next.setMonth(next.getMonth() + 1);
  return { fullyPaid: false, nextDueAt: next };
}

/**
 * Сколько партнёр получит на руки и сколько мы удержим.
 *
 * Решение владельца 15.08: 20% — сумма ДО налога. С самозанятым и ИП мы просто
 * платим начисленное, налог их. С физлицом мы налоговый агент: НДФЛ удерживаем
 * из его же доли.
 *
 * ⚠️ Взносы СФР сюда не входят: они наш расход сверх суммы, и партнёру их
 * видеть незачем — это разговор о том, почему его 70 000 «на самом деле сто
 * тысяч», который не нужен ни ему, ни нам.
 */
export function payoutBreakdown(
  accruedRub: number,
  taxStatus: PartnerTaxStatus | null | undefined,
): { grossRub: number; ndflRub: number; netRub: number; statusKnown: boolean } {
  const grossRub = round2(accruedRub);

  if (!taxStatus) {
    // Статус ещё не спрашивали. Показываем сумму как есть, но помечаем — иначе
    // физлицо увидит «на руки 70 000», а получит 60 900.
    return { grossRub, ndflRub: 0, netRub: grossRub, statusKnown: false };
  }

  if (taxStatus !== "individual") {
    return { grossRub, ndflRub: 0, netRub: grossRub, statusKnown: true };
  }

  const ndflRub = round2((grossRub * NDFL_RATE_PERCENT) / 100);
  return { grossRub, ndflRub, netRub: round2(grossRub - ndflRub), statusKnown: true };
}

/**
 * Сколько клиент платит ПРЯМО СЕЙЧАС по этому заказу.
 *
 * 🔴 Самая опасная цифра на странице оплаты: увидев полную сумму договора там,
 * где ждали половину, человек уходит думать — и не возвращается. Считается от
 * уже оплаченного, а не от номера части: две частичные оплаты подряд не должны
 * превратиться в требование заплатить сверх договора.
 */
export function dueNowRub(args: {
  amountRub: number;
  paidRub: number;
  installments: number;
}): number {
  const remaining = round2(args.amountRub - args.paidRub);
  if (remaining <= 0) return 0;

  const parts = Math.max(1, Math.min(args.installments, 2));
  const part = round2(args.amountRub / parts);

  // Остаток меньше части — платим остаток: доплачивать «до части» нечего.
  return Math.min(part, remaining);
}
