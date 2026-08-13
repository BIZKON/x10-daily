import { describe, expect, it } from "vitest";
import {
  PLAN_SLOTS,
  groupByDate,
  monthGrid,
  parseRange,
  parseView,
  periodBounds,
  weekDays,
} from "../src/lib/plan-calendar";

/**
 * Календарь контент-плана (спека 13.08 §9): один план, два режима показа.
 *
 * 🔴 Раскладку считает СЕРВЕР, а не вёрстка — по тому же правилу, что и режим
 * экрана базы знаний: два места считали бы границы недели по-разному, и человек
 * попадал бы то в одну неделю, то в другую без понятной причины.
 *
 * Здесь проверяется арифметика дат: она ломается молча и всегда на границах —
 * переход через месяц, февраль, високосный год.
 */

describe("параметры экрана", () => {
  it("по умолчанию — лента по дням", () => {
    // Сервер не знает ширину экрана. Угадывать — значит иногда открывать
    // человеку сетку 7×4 на телефоне, где она нечитаема. Лента работает везде.
    expect(parseView(undefined)).toBe("days");
    expect(parseRange(undefined)).toBe("week");
  });

  it("осмысленные значения принимаются", () => {
    expect(parseView("calendar")).toBe("calendar");
    expect(parseRange("month")).toBe("month");
  });

  it("мусор в адресе не роняет экран", () => {
    expect(parseView("хочу-таблицу")).toBe("days");
    expect(parseRange("год")).toBe("week");
  });
});

describe("periodBounds — неделя", () => {
  it("неделя начинается в понедельник и кончается воскресеньем", () => {
    // 20 августа 2026 — четверг.
    expect(periodBounds("week", "2026-08-20")).toEqual({ start: "2026-08-17", end: "2026-08-23" });
  });

  it("воскресенье относится к УХОДЯЩЕЙ неделе, а не к следующей", () => {
    // Классическая ошибка недельной арифметики: у JS воскресенье это 0.
    expect(periodBounds("week", "2026-08-23")).toEqual({ start: "2026-08-17", end: "2026-08-23" });
  });

  it("неделя на стыке месяцев не обрезается", () => {
    // 1 сентября 2026 — вторник, неделя начинается 31 августа.
    expect(periodBounds("week", "2026-09-01")).toEqual({ start: "2026-08-31", end: "2026-09-06" });
  });
});

describe("periodBounds — месяц", () => {
  it("месяц — от первого до последнего числа", () => {
    expect(periodBounds("month", "2026-08-20")).toEqual({ start: "2026-08-01", end: "2026-08-31" });
  });

  it("короткий месяц не выдумывает 31-е число", () => {
    expect(periodBounds("month", "2026-11-05")).toEqual({ start: "2026-11-01", end: "2026-11-30" });
  });

  it("февраль невисокосного года кончается 28-м", () => {
    expect(periodBounds("month", "2026-02-10").end).toBe("2026-02-28");
  });

  it("🔴 февраль високосного года кончается 29-м", () => {
    expect(periodBounds("month", "2028-02-10").end).toBe("2028-02-29");
  });
});

describe("weekDays", () => {
  it("отдаёт семь дней подряд, начиная с переданного", () => {
    expect(weekDays("2026-08-17")).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
    ]);
  });
});

describe("monthGrid — сетка месяца", () => {
  it("сетка всегда прямоугольная: целое число недель по семь дней", () => {
    for (const anchor of ["2026-08-01", "2026-02-01", "2028-02-01", "2026-11-01"]) {
      const grid = monthGrid(anchor);
      expect(grid.length % 7).toBe(0);
      expect(grid.length).toBeGreaterThanOrEqual(28);
      expect(grid.length).toBeLessThanOrEqual(42);
    }
  });

  it("первая клетка — понедельник, даже если месяц начался в пятницу", () => {
    // Август 2026 начинается в субботу; сетка стартует 27 июля.
    const grid = monthGrid("2026-08-01");
    expect(grid[0]?.date).toBe("2026-07-27");
    expect(grid[0]?.inMonth).toBe(false);
  });

  it("дни своего месяца помечены, чужие — нет", () => {
    const grid = monthGrid("2026-08-01");
    const own = grid.filter((c) => c.inMonth);
    expect(own).toHaveLength(31);
    expect(own[0]?.date).toBe("2026-08-01");
    expect(own[30]?.date).toBe("2026-08-31");
  });

  it("🔴 месяц, целиком укладывающийся в недели, не тянет лишний ряд пустых клеток", () => {
    // Февраль 2027 начинается в понедельник и длится 28 дней — ровно 4 недели.
    const grid = monthGrid("2027-02-01");
    expect(grid).toHaveLength(28);
  });
});

describe("groupByDate", () => {
  const items = [
    { plannedFor: "2026-08-18", title: "Страховка груза" },
    { plannedFor: "2026-08-18", title: "Хранение" },
    { plannedFor: "2026-08-20", title: "Упаковка" },
  ];

  it("темы одного дня лежат вместе, порядок сохранён", () => {
    const byDay = groupByDate(items);
    expect(byDay.get("2026-08-18")?.map((i) => i.title)).toEqual(["Страховка груза", "Хранение"]);
    expect(byDay.get("2026-08-20")).toHaveLength(1);
  });

  it("день без тем просто отсутствует, а не ломает выборку", () => {
    expect(groupByDate(items).get("2026-08-19")).toBeUndefined();
  });
});

describe("слоты", () => {
  it("совпадают с расписанием публикации", () => {
    // Разъедутся с cron из drain-post-slots — план будет обещать выход в
    // время, когда очередь не разбирается.
    expect(PLAN_SLOTS).toEqual(["09:30", "12:30", "15:30", "18:30"]);
  });
});
