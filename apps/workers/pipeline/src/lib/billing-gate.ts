import type { Env } from "@x10/config";
import { type Database, and, balanceEntries, clientBalance, eq, gte, sql } from "@x10/db";
import { mskDayString } from "./cost-ledger";
import { deliverOpsAlert } from "./ops-alert";

/**
 * Остановка по нулю и предупреждение о низком остатке (Спека 6, шаг 2).
 *
 * Первый механизм, который реально ОСТАНАВЛИВАЕТ работу, поэтому три вещи здесь
 * важнее краткости:
 *
 * 1. **Уже начатое доделывается.** Гейт стоит на входе в дорогие функции, а не
 *    внутри них: бросать материал на полпути дороже, чем доработать в минус на
 *    копейки.
 * 2. **Заплаченное выходит.** `drain-post-slots` намеренно НЕ гейтится —
 *    одобренное к публикации оплачено ещё при подготовке.
 * 3. **Предупреждаем заранее и один раз в сутки.** Слать на каждый прогон
 *    нельзя: клиент отключит уведомления и не увидит настоящую остановку.
 */

export type BalanceRow = {
  balanceRub: number;
  lowThresholdRub: number;
  billingEnforced: boolean;
};

export type BillingState = BalanceRow & {
  /** Новую работу брать нельзя. */
  blocked: boolean;
  /** Остаток ниже порога, но работа ещё идёт — самое время предупредить. */
  low: boolean;
};

/**
 * Чистое решение по остатку — вся политика денег в одном месте.
 *
 * `billingEnforced=false` гасит и остановку, и предупреждения: в нашей
 * собственной копии остаток всегда отрицательный, и включённый контур давал бы
 * ежедневную ложную тревогу.
 *
 * `low` только при ПОЛОЖИТЕЛЬНОМ остатке: на нуле это уже не «заканчивается», а
 * «закончилось», и про это говорит отдельный, более громкий алерт.
 */
export function decideBillingState(row: BalanceRow): BillingState {
  if (!row.billingEnforced) return { ...row, blocked: false, low: false };
  return {
    ...row,
    blocked: row.balanceRub <= 0,
    low: row.balanceRub > 0 && row.balanceRub < row.lowThresholdRub,
  };
}

/**
 * Прочитать баланс. Строки нет (копия развёрнута до миграции) → считаем контур
 * выключенным: неизвестное состояние не повод останавливать чужой завод.
 */
export async function readBillingState(db: Database): Promise<BillingState> {
  const [row] = await db
    .select({
      balanceRub: clientBalance.balanceRub,
      lowThresholdRub: clientBalance.lowThresholdRub,
      billingEnforced: clientBalance.billingEnforced,
    })
    .from(clientBalance)
    .limit(1);
  if (!row) {
    return decideBillingState({ balanceRub: 0, lowThresholdRub: 0, billingEnforced: false });
  }
  return decideBillingState({
    balanceRub: Number(row.balanceRub),
    lowThresholdRub: Number(row.lowThresholdRub),
    billingEnforced: row.billingEnforced,
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Окно наблюдения за расходом. */
const SPEND_WINDOW_DAYS = 7;
/**
 * Меньше суток наблюдений — оценку не даём.
 *
 * 🔴 Найдено репетицией на проде 07.08.2026. Делили сумму на ПОЛНЫЕ 7 дней окна
 * независимо от того, сколько данных реально накопилось: за два часа работы
 * вышло «хватит на 3080 дней». У нового клиента, где истории всегда мало,
 * первая же неделя выглядела бы так — и остановка стала бы для него полной
 * неожиданностью. Молчание честнее выдуманного числа.
 */
const MIN_OBSERVED_DAYS = 1;

/**
 * Средний расход клиента в сутки, рубли.
 *
 * Считается по ЕГО списаниям, а не по нашему ритму: клиент, публикующий вдвое
 * реже, растянет ту же сумму вдвое дольше.
 *
 * Делим на ФАКТИЧЕСКИ наблюдённый срок, а не на длину окна: пока данных меньше
 * суток, возвращаем 0 — «не знаем». 0 означает «оценку не показывать».
 */
export async function avgDailyChargeRub(db: Database, now: Date): Promise<number> {
  const since = new Date(now.getTime() - SPEND_WINDOW_DAYS * DAY_MS);
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(-${balanceEntries.amountRub}), 0)`,
      oldest: sql<string | null>`min(${balanceEntries.createdAt})`,
    })
    .from(balanceEntries)
    .where(and(eq(balanceEntries.kind, "charge"), gte(balanceEntries.createdAt, since)));

  if (!row?.oldest) return 0;
  const total = Number(row.total);
  if (!(total > 0)) return 0;

  const observedDays = (now.getTime() - new Date(row.oldest).getTime()) / DAY_MS;
  if (observedDays < MIN_OBSERVED_DAYS) return 0;
  return total / Math.min(observedDays, SPEND_WINDOW_DAYS);
}

/** «≈ на 9 дней» — человеческий хвост к сумме. Пусто, если считать не из чего. */
export function daysLeftPhrase(balanceRub: number, avgPerDayRub: number): string {
  if (avgPerDayRub <= 0 || balanceRub <= 0) return "";
  const days = Math.floor(balanceRub / avgPerDayRub);
  if (days < 1) return " — меньше суток при нынешнем расходе";
  return ` — примерно на ${days} ${plural(days, "день", "дня", "дней")} при нынешнем расходе`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/** Рубли для человека: без хвоста копеек, с пробелом между разрядами. */
export function formatRub(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU").replace(/ /g, " ")} ₽`;
}

const TOPUP_HINT = "Пополнить — в кабинете, раздел «Расходы».";

export function lowBalanceMessage(balanceRub: number, avgPerDayRub: number): string {
  const tail = daysLeftPhrase(balanceRub, avgPerDayRub);
  return `⚠️ Баланс заканчивается: осталось ${formatRub(balanceRub)}${tail}.

Когда остаток дойдёт до нуля, подготовка новых материалов остановится. Уже одобренное к публикации выйдет по расписанию.

${TOPUP_HINT}`;
}

export function emptyBalanceMessage(balanceRub: number): string {
  return `🛑 Баланс исчерпан: ${formatRub(balanceRub)}.

Подготовка новых материалов остановлена. Уже одобренное к публикации выйдет по расписанию — оно оплачено.

${TOPUP_HINT}`;
}

/**
 * Проверить деньги перед тратой и, если нужно, предупредить клиента.
 *
 * Возвращает состояние; вызывающий сам решает, что делать с `blocked` — так
 * каждая функция может завершиться своим осмысленным результатом, а не
 * исключением на ровном месте.
 *
 * НИКОГДА не бросает: сбой денежного контура не должен ронять конвейер
 * (контракт тот же, что у ops-алертов). Не смогли прочитать баланс — работаем.
 */
export async function guardBilling(db: Database, env: Env, now: Date): Promise<BillingState> {
  let state: BillingState;
  try {
    state = await readBillingState(db);
  } catch (e) {
    console.error(`[billing-gate] баланс не прочитан, пропускаем работу: ${String(e)}`);
    return {
      balanceRub: 0,
      lowThresholdRub: 0,
      billingEnforced: false,
      blocked: false,
      low: false,
    };
  }

  if (!state.blocked && !state.low) return state;

  // Оценка «хватит на N дней» — украшение, а не суть предупреждения. Считаем её
  // ОТДЕЛЬНО: иначе сбой этого запроса отменил бы само предупреждение, то есть
  // из-за необязательной детали клиент не узнал бы о заканчивающихся деньгах.
  let avg = 0;
  if (state.low) {
    try {
      avg = await avgDailyChargeRub(db, now);
    } catch (e) {
      console.error(`[billing-gate] средний расход не посчитан: ${String(e)}`);
    }
  }

  try {
    await deliverOpsAlert(db, env, {
      day: mskDayString(now),
      kind: state.blocked ? "balance_empty" : "balance_low",
      // cost_alerts.spend_usd — про ДОЛЛАРОВЫЙ расход дня, к остатку он
      // отношения не имеет. Кладём 0, а суммы живут в тексте алерта.
      spendUsd: 0,
      message: state.blocked
        ? emptyBalanceMessage(state.balanceRub)
        : lowBalanceMessage(state.balanceRub, avg),
    });
  } catch (e) {
    // Предупреждение — не повод останавливать то, что ещё можно сделать.
    console.error(`[billing-gate] предупреждение не отправлено: ${String(e)}`);
  }

  return state;
}
