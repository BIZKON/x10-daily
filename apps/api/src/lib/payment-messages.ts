/**
 * Тексты уведомлений о поступившей оплате (спека 7).
 *
 * Вынесены отдельно от отправки: это чужие деньги и чужие клиенты, и ошибка
 * здесь не падает, а рассказывает лишнее не тому человеку.
 *
 * 🔴 Правило, которое соблюдается уже в кабинете: наставник видит ОБОРОТ
 * приведённого партнёра, но не его клиентов по именам. Процент — не повод
 * открывать чужую клиентскую базу.
 */

const rub = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

export type PaidNotice = {
  dealNo: number;
  clientName: string;
  /** Сколько пришло этим платежом. */
  paymentRub: number;
  /** Сколько всего оплачено по заказу после него. */
  paidTotalRub: number;
  amountRub: number;
  fullyPaid: boolean;
};

/** Продавцу: его клиент, его деньги — можно всё. */
export function sellerPaidMessage(n: PaidNotice, accruedRub: number): string {
  const head = `<b>Оплата по заказу № ${n.dealNo}</b>`;
  const money = `${n.clientName} заплатил ${rub(n.paymentRub)}.`;
  const yours = accruedRub > 0 ? `\nВам начислено <b>${rub(accruedRub)}</b>.` : "";
  const rest = n.fullyPaid
    ? "\nЗаказ оплачен полностью."
    : `\nОсталось ${rub(n.amountRub - n.paidTotalRub)} — напомните клиенту, когда подойдёт срок.`;
  return `${head}\n${money}${yours}${rest}`;
}

/**
 * Наставнику: сумма его доли и имя ПАРТНЁРА, без клиента.
 *
 * ⚠️ Имя клиента сюда не попадает намеренно. Наставник получает процент за то,
 * что привёл и обучил продавца, а не за доступ к его сделкам.
 */
export function mentorPaidMessage(sellerName: string, accruedRub: number): string {
  return (
    "<b>Начисление за приведённого партнёра</b>\n" +
    `${sellerName} получил оплату от клиента.\n` +
    `Вам начислено <b>${rub(accruedRub)}</b>.`
  );
}

/** Владельцу: всё, включая разбивку — это его деньги и его обязательства. */
export function ownerPaidMessage(
  n: PaidNotice,
  parts: { sellerName: string | null; sellerRub: number; mentorRub: number },
): string {
  const lines = [
    `<b>Оплата по заказу № ${n.dealNo}</b>`,
    `${n.clientName} — ${rub(n.paymentRub)} (оплачено ${rub(n.paidTotalRub)} из ${rub(n.amountRub)})`,
  ];
  if (parts.sellerName) {
    lines.push(`Партнёр: ${parts.sellerName} — ${rub(parts.sellerRub)}`);
  }
  if (parts.mentorRub > 0) {
    lines.push(`Наставнику — ${rub(parts.mentorRub)}`);
  }
  if (n.fullyPaid) lines.push("Заказ закрыт полностью.");
  return lines.join("\n");
}
