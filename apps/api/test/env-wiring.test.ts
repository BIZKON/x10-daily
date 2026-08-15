import { describe, expect, it } from "vitest";

/**
 * Проводка env-ключей от `process.env` до приложения.
 *
 * 🔴 Ключ проходит ПЯТЬ слоёв: схема `@x10/config`, интерфейс `AppBindings`,
 * `readBindings` (process.env → биндинги), `getEnv` (биндинги → env) и compose.
 * Пропущенный слой не роняет сборку и не виден в типах: переменная есть в
 * контейнере, а функция молча выключена.
 *
 * Так и случилось 15.08: раздел партнёров отвечал 404 при
 * `X10_PARTNERS_ENABLED=1` в контейнере — ключ не был вписан в `readBindings`.
 * Этот тест — про ту дырку, а не про типы.
 */

/** Ключи, без которых функция молча перестаёт работать. */
const WIRED = [
  "X10_PARTNERS_ENABLED",
  "X10_PARTNER_SLUGS",
  "X10_BASE_DOMAIN",
  "X10_ALLOWED_ORIGINS",
  "TELEGRAM_BOT_TOKEN",
  "X10_JWT_SECRET",
] as const;

describe("env доезжает от process.env до биндингов", () => {
  it("🔴 каждый ключ проводки читается из окружения", async () => {
    const saved: Record<string, string | undefined> = {};
    for (const k of WIRED) {
      saved[k] = process.env[k];
      process.env[k] = `значение-${k}`;
    }
    process.env.DATABASE_URL ??= "postgresql://test:test@localhost/test";

    try {
      // ⚠️ Импорт динамический: модуль сервера читает окружение на загрузке и
      // без DATABASE_URL падает ещё до теста.
      const { readBindings } = await import("../src/server");
      const b = readBindings() as unknown as Record<string, unknown>;
      for (const k of WIRED) {
        expect(b[k], `${k} не вписан в readBindings — в контейнере есть, в коде нет`).toBe(
          `значение-${k}`,
        );
      }
    } finally {
      for (const k of WIRED) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });
});
