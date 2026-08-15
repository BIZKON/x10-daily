import { describe, expect, it } from "vitest";
import { normalizeSlug, reservedSlugFor } from "../src/lib/partner-slug";

/**
 * Привязка партнёра к его версии КП (`/kp/<slug>/`).
 *
 * 🔴 Слаг связывает человека с документом, который уже разослан клиентам.
 * Ошибка здесь означает, что партнёр рекомендует чужую страницу с чужими
 * контактами — и лид уходит не туда.
 */

describe("бронь слага по имени в Telegram", () => {
  const RESERVED = "igorivanov_top:ivanov, AnnaPSYnemchenko:nemchenko,ViktoriaKustria:kustrya";

  it("узнаёт партнёра по его username", () => {
    expect(reservedSlugFor(RESERVED, "igorivanov_top")).toBe("ivanov");
    expect(reservedSlugFor(RESERVED, "ViktoriaKustria")).toBe("kustrya");
  });

  it("🔴 регистр в username не важен", () => {
    // Telegram отдаёт username как придётся, а человек регистрируется один раз:
    // разошлись регистры — партнёр остался без своей страницы и не поймёт почему.
    expect(reservedSlugFor(RESERVED, "annapsynemchenko")).toBe("nemchenko");
    expect(reservedSlugFor(RESERVED, "IGORIVANOV_TOP")).toBe("ivanov");
  });

  it("собачка в начале не мешает", () => {
    expect(reservedSlugFor(RESERVED, "@ivanov_not_listed")).toBeNull();
    expect(reservedSlugFor(RESERVED, "@igorivanov_top")).toBe("ivanov");
  });

  it("незнакомый человек слага не получает", () => {
    expect(reservedSlugFor(RESERVED, "someone")).toBeNull();
    expect(reservedSlugFor(RESERVED, null)).toBeNull();
  });

  it("пустая настройка никого не ломает", () => {
    expect(reservedSlugFor("", "igorivanov_top")).toBeNull();
    expect(reservedSlugFor(undefined, "igorivanov_top")).toBeNull();
  });

  it("мусор в настройке пропускается, остальные пары работают", () => {
    expect(reservedSlugFor("сломано, igorivanov_top:ivanov", "igorivanov_top")).toBe("ivanov");
  });
});

describe("нормализация слага", () => {
  it("приводит к виду, пригодному для адреса", () => {
    expect(normalizeSlug(" Ivanov ")).toBe("ivanov");
    expect(normalizeSlug("Petrov-2")).toBe("petrov-2");
  });

  it("🔴 кириллицу и пробелы не пропускает", () => {
    // Адрес /kp/иванов/ выглядит рабочим, но в мессенджере ломается о
    // процентное кодирование, а партнёр отправит его клиенту как есть.
    expect(normalizeSlug("иванов")).toBeNull();
    expect(normalizeSlug("ivan petrov")).toBe("ivan-petrov");
  });

  it("пусто — это осознанный отказ от страницы, а не ошибка", () => {
    expect(normalizeSlug("")).toBeNull();
    expect(normalizeSlug("   ")).toBeNull();
  });

  it("слишком длинный обрезается, а не отвергается", () => {
    expect(normalizeSlug("x".repeat(80))?.length).toBe(64);
  });
});
