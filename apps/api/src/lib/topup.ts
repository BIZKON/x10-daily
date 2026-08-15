import { MIN_TOPUP_RUB } from "@x10/config";

/**
 * Проверка суммы пополнения баланса (спека 6, шаг 3).
 *
 * Номиналы на кнопках — подсказка, а не ограничение: владелец кладёт сколько
 * решил. Ограничиваем два конца — снизу минимумом, сверху здравым смыслом.
 */

/**
 * Потолок одного пополнения.
 *
 * 🔴 Защита не от злоумышленника (платит владелец своей картой), а от лишнего
 * нуля: 100 000 вместо 10 000 замечаешь на странице оплаты, а миллион — уже
 * после списания, и возвращать его придётся через поддержку ЮKassa.
 */
export const MAX_TOPUP_RUB = 300_000;

export type TopupCheck = { ok: true; amountRub: number } | { ok: false; error: string };

/** Целые рубли: копейки на балансе, который тратится сотнями рублей, — шум. */
export function checkTopupAmount(value: unknown): TopupCheck {
  const amountRub = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(amountRub)) {
    return { ok: false, error: "Сумма не распознана." };
  }
  if (!Number.isInteger(amountRub)) {
    return { ok: false, error: "Сумма — целое число рублей." };
  }
  if (amountRub < MIN_TOPUP_RUB) {
    return { ok: false, error: `Минимальное пополнение — ${MIN_TOPUP_RUB} ₽.` };
  }
  if (amountRub > MAX_TOPUP_RUB) {
    return {
      ok: false,
      error: `Больше ${MAX_TOPUP_RUB} ₽ за раз не принимаем — проверь, не лишний ли ноль.`,
    };
  }
  return { ok: true, amountRub };
}
