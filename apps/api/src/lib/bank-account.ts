/**
 * Проверка банковских реквизитов по алгоритму ЦБ РФ (спека 7).
 *
 * 🔴 Опечатка в двадцатизначном счёте не видна глазами и не ломает ничего у
 * нас: счёт уедет клиенту, бухгалтерия отправит деньги в никуда, и выяснится
 * это через несколько дней — когда виноватым окажется наш документ.
 *
 * Контрольный ключ считается по БИК, поэтому ловит и подмену цифры, и
 * перестановку соседних. Стоит пятнадцати строк и снимает целый класс споров.
 */

/** Веса разрядов из положения 762-П. */
const WEIGHTS = [7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1];

/**
 * Сходится ли контрольный ключ счёта с БИК.
 *
 * Корреспондентский счёт (начинается с 301) проверяется по «0» и пятой-шестой
 * цифрам БИК, расчётный — по трём последним. Это не наша выдумка, а разные
 * правила для счетов в подразделении ЦБ и в самом банке.
 */
export function accountKeyValid(bik: string, account: string): boolean {
  if (!/^\d{9}$/.test(bik) || !/^\d{20}$/.test(account)) return false;

  const prefix = account.startsWith("301") ? `0${bik.slice(4, 6)}` : bik.slice(6, 9);
  const digits = `${prefix}${account}`.split("").map(Number);

  const sum = digits.reduce((acc, digit, i) => acc + ((digit * (WEIGHTS[i] ?? 0)) % 10), 0);
  return sum % 10 === 0;
}

export type BankDetails = {
  name: string;
  bik: string;
  account: string;
  corrAccount: string;
};

export type BankCheck =
  | { ok: true; bank: BankDetails }
  | { ok: false; reason: "not_set" | "bad_bik" | "bad_account" | "bad_corr_account" };

/**
 * Реквизиты из окружения — или причина, по которой счёт выставлять нельзя.
 *
 * ⚠️ Все четыре значения обязательны вместе. Счёт с тремя реквизитами из
 * четырёх выглядит заполненным, но в банке клиента не проходит.
 */
export function checkBankDetails(env: {
  X10_BANK_NAME?: string;
  X10_BANK_BIK?: string;
  X10_BANK_ACCOUNT?: string;
  X10_BANK_CORR_ACCOUNT?: string;
}): BankCheck {
  const name = env.X10_BANK_NAME?.trim();
  const bik = env.X10_BANK_BIK?.trim();
  const account = env.X10_BANK_ACCOUNT?.trim();
  const corrAccount = env.X10_BANK_CORR_ACCOUNT?.trim();

  if (!name || !bik || !account || !corrAccount) return { ok: false, reason: "not_set" };
  if (!/^\d{9}$/.test(bik)) return { ok: false, reason: "bad_bik" };
  if (!accountKeyValid(bik, account)) return { ok: false, reason: "bad_account" };
  if (!accountKeyValid(bik, corrAccount)) return { ok: false, reason: "bad_corr_account" };

  return { ok: true, bank: { name, bik, account, corrAccount } };
}

/** Причина отказа: только у неуспешного разбора. */
export type BankProblem = Extract<BankCheck, { ok: false }>["reason"];

/** Человеческое объяснение для логов: что именно не так с реквизитами. */
export const BANK_PROBLEM: Record<BankProblem, string> = {
  not_set: "заданы не все четыре значения",
  bad_bik: "БИК не девять цифр",
  bad_account: "контрольный ключ расчётного счёта не сходится с БИК — вероятна опечатка",
  bad_corr_account: "контрольный ключ корсчёта не сходится с БИК — вероятна опечатка",
};
