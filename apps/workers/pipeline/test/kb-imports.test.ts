import type { Database } from "@x10/db";
import { describe, expect, it, vi } from "vitest";
import { REPLACEABLE_STATUS, buildProposalRows, saveProposals } from "../src/lib/kb-imports";

/**
 * Запись предложений обхода в базу знаний (спека «база знаний по ссылке» §6.1).
 *
 * Аудит 13.08 нашёл дыру в покрытии: правило «сносим непринятое, не трогаем
 * принятое» проверялось только руками на проде. Это ровно тот класс правил,
 * который ломается молча — удаление лишнего заметят через неделю.
 *
 * 🔴 Что здесь проверяется на самом деле: РЕШЕНИЯ, а не проводка. Раскладка
 * документов по полкам — чистая функция, её видно целиком. Условие удаления
 * вынесено в константу `REPLACEABLE_STATUS`, потому что проверять текст
 * SQL-запроса бессмысленно: такой тест подтверждал бы и вывернутый наизнанку
 * смысл (грабля сессии 34).
 */

const SHELVES = [
  { id: "sh-1", slug: "business" },
  { id: "sh-2", slug: "prices" },
];

const doc = (over: Partial<Record<string, unknown>> = {}) => ({
  shelfSlug: "business",
  title: "Сборные грузы",
  body: "Возим сборные грузы по России.",
  sourceUrl: "https://veles.ru/about",
  ...over,
});

describe("buildProposalRows — что ляжет в базу", () => {
  it("🔴 материал приходит как ПРЕДЛОЖЕНИЕ, а не как знание", () => {
    // Вся безопасность фичи держится на этом статусе: loadKnowledge берёт
    // только `ready`, поэтому предложение физически не уедет в промпт.
    const rows = buildProposalRows([doc()], SHELVES, "imp-1");
    expect(rows[0]?.status).toBe("proposed");
    expect(rows[0]?.source).toBe("url");
  });

  it("слаг полки превращается в её id", () => {
    const rows = buildProposalRows([doc({ shelfSlug: "prices" })], SHELVES, "imp-1");
    expect(rows[0]?.shelfId).toBe("sh-2");
  });

  it("🔴 документ на несуществующую полку отбрасывается, соседний живёт", () => {
    const rows = buildProposalRows([doc({ shelfSlug: "vydumannaya" }), doc()], SHELVES, "imp-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.shelfId).toBe("sh-1");
  });

  it("длину текста считает сервер, а не тот, кто прислал", () => {
    const rows = buildProposalRows([doc({ body: "12345" })], SHELVES, "imp-1");
    expect(rows[0]?.charCount).toBe(5);
  });

  it("каждый материал помнит, каким обходом предложен", () => {
    const rows = buildProposalRows([doc()], SHELVES, "imp-7");
    expect(rows[0]?.importId).toBe("imp-7");
  });

  it("отсутствующий адрес источника остаётся пустым, а не выдумывается", () => {
    const rows = buildProposalRows([doc({ sourceUrl: null })], SHELVES, "imp-1");
    expect(rows[0]?.sourceUrl).toBeNull();
  });
});

describe("REPLACEABLE_STATUS — что именно сносит повторный обход", () => {
  it("🔴 сносится только предложенное", () => {
    // Решение владельца 12.08: непринятое ещё не знание, терять там нечего.
    expect(REPLACEABLE_STATUS).toBe("proposed");
  });

  it("🔴 принятое человеком под снос не попадает никогда", () => {
    // Принятое — уже его знание, и обход не вправе его переписывать. Если это
    // когда-нибудь станет массивом статусов, тест обязан упасть.
    expect(REPLACEABLE_STATUS).not.toBe("ready");
  });
});

describe("saveProposals — порядок работы", () => {
  /** Поддельная база: записывает, что с ней делали. Реального pg здесь нет. */
  function fakeDb() {
    const calls: string[] = [];
    let inserted: unknown[] = [];
    let updated: Record<string, unknown> | null = null;

    const db = {
      select: () => ({
        from: () => ({ where: async () => SHELVES }),
      }),
      delete: () => {
        calls.push("delete");
        return { where: async () => undefined };
      },
      insert: () => {
        calls.push("insert");
        return {
          values: async (rows: unknown[]) => {
            inserted = rows;
          },
        };
      },
      update: () => {
        calls.push("update");
        return {
          set: (patch: Record<string, unknown>) => {
            updated = patch;
            return { where: async () => undefined };
          },
        };
      },
    } as unknown as Database;

    return { db, calls, inserted: () => inserted, updated: () => updated };
  }

  it("🔴 старое сносится ДО записи нового", async () => {
    // Наоборот — и свежие предложения удалит собственная же уборка.
    const f = fakeDb();
    await saveProposals(f.db, "imp-1", { documents: [doc()], notes: [], log: [] });
    expect(f.calls.indexOf("delete")).toBeLessThan(f.calls.indexOf("insert"));
  });

  it("возвращает число реально записанных материалов", async () => {
    const f = fakeDb();
    const n = await saveProposals(f.db, "imp-1", {
      documents: [doc(), doc({ shelfSlug: "net-takoy" })],
      notes: [],
      log: [],
    });
    expect(n).toBe(1);
    expect(f.inserted()).toHaveLength(1);
  });

  it("пустой улов не пишет пустую вставку, но задание закрывает", async () => {
    const f = fakeDb();
    const n = await saveProposals(f.db, "imp-1", { documents: [], notes: ["нет цен"], log: [] });
    expect(n).toBe(0);
    expect(f.calls).not.toContain("insert");
    expect(f.updated()).toMatchObject({ status: "ready", proposed: 0, notes: ["нет цен"] });
  });

  it("отчёт о страницах и заметки сохраняются в задании", async () => {
    const f = fakeDb();
    const log = [{ url: "https://veles.ru/about", status: "read" as const, chars: 100 }];
    await saveProposals(f.db, "imp-1", { documents: [doc()], notes: ["нет кейсов"], log });
    expect(f.updated()).toMatchObject({ pages: log, notes: ["нет кейсов"], proposed: 1 });
  });
});
