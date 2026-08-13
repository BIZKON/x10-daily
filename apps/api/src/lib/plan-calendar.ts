/**
 * Календарь контент-плана: границы периода и раскладка по дням (спека 13.08 §9).
 *
 * 🔴 Считает СЕРВЕР, а не вёрстка. То же правило, что у режима экрана базы
 * знаний: два места считали бы границы недели по-разному, и человек попадал бы
 * то в одну неделю, то в другую без понятной причины.
 *
 * Даты здесь — строки `ГГГГ-ММ-ДД` без времени, как в колонке `planned_for`.
 * Часовой пояс намеренно не участвует: план живёт днями, а не мгновениями, и
 * перевод в UTC сдвигал бы дату у половины страны.
 */

/** Слоты выхода, МСК. Совпадают с расписанием `drain-post-slots`. */
export const PLAN_SLOTS = ["09:30", "12:30", "15:30", "18:30"] as const;
export type PlanSlot = (typeof PLAN_SLOTS)[number];

/** Режим показа: сетка календаря или лента по дням. */
export type PlanView = "calendar" | "days";
/** Горизонт: ближайшая неделя или месяц целиком. */
export type PlanRange = "week" | "month";

/**
 * Режим по умолчанию — лента.
 *
 * Сервер не знает ширину экрана, а угадывать значит иногда открывать человеку
 * сетку «7 × 4» на телефоне, где она нечитаема. Лента работает везде одинаково
 * и несёт обоснование темы — то, ради чего план и собирают.
 */
export function parseView(raw: string | undefined | null): PlanView {
  return raw === "calendar" ? "calendar" : "days";
}

export function parseRange(raw: string | undefined | null): PlanRange {
  return raw === "month" ? "month" : "week";
}

/* ── Арифметика дат ──────────────────────────────────────────────────────── */

function toParts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}

function fmt(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Полдень UTC, чтобы перевод часов ни в одном поясе не сдвинул дату. */
function toUtc(iso: string): Date {
  const { y, m, d } = toParts(iso);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function fromUtc(date: Date): string {
  return fmt(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addDays(iso: string, days: number): string {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtc(date);
}

/** Понедельник недели, в которую попала дата. У JS воскресенье — 0, не 7. */
export function weekStart(iso: string): string {
  const weekday = toUtc(iso).getUTCDay();
  const shift = weekday === 0 ? 6 : weekday - 1;
  return addDays(iso, -shift);
}

/** Сколько дней в месяце этой даты; високосный год считает сам Date. */
export function daysInMonth(iso: string): number {
  const { y, m } = toParts(iso);
  return new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
}

/** Границы периода включительно. */
export function periodBounds(range: PlanRange, anchor: string): { start: string; end: string } {
  if (range === "month") {
    const { y, m } = toParts(anchor);
    return { start: fmt(y, m, 1), end: fmt(y, m, daysInMonth(anchor)) };
  }
  const start = weekStart(anchor);
  return { start, end: addDays(start, 6) };
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export type MonthCell = { date: string; inMonth: boolean };

/**
 * Сетка месяца: целое число недель, начиная с понедельника.
 *
 * Хвостовые недели не добавляются ради ровного вида — февраль, начавшийся с
 * понедельника, честно занимает четыре ряда, а не пять с пустым.
 */
export function monthGrid(anchor: string): MonthCell[] {
  const { y, m } = toParts(anchor);
  const first = fmt(y, m, 1);
  const last = fmt(y, m, daysInMonth(anchor));

  const gridStart = weekStart(first);
  const gridEnd = addDays(weekStart(last), 6);

  const cells: MonthCell[] = [];
  for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) {
    cells.push({ date: day, inMonth: day >= first && day <= last });
  }
  return cells;
}

/** Сгруппировать темы по дню, сохранив порядок выборки. */
export function groupByDate<T extends { plannedFor: string }>(
  items: readonly T[],
): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  for (const item of items) {
    const bucket = byDay.get(item.plannedFor);
    if (bucket) bucket.push(item);
    else byDay.set(item.plannedFor, [item]);
  }
  return byDay;
}
