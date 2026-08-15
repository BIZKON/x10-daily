import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Проводка env-ключа от контейнера до кода.
 *
 * 🔴 Ключ проходит ПЯТЬ слоёв, и каждый заполняется руками:
 *
 *   1. `packages/config/src/env.ts`  — схема (Zod)
 *   2. `apps/api/src/bindings.ts`    — интерфейс AppBindings
 *   3. `apps/api/src/server.ts`      — process.env → биндинги
 *   4. `apps/api/src/env.ts`         — биндинги → env приложения
 *   5. `docker-compose.prod.yml`     — окружение контейнера
 *
 * Пропущенный слой не роняет ни сборку, ни типы: переменная есть в контейнере,
 * а функция молча выключена. Так и вышло 15.08 — раздел партнёров отвечал 404
 * при `X10_PARTNERS_ENABLED=1`, подтверждённом `printenv` внутри контейнера:
 * ключа не было в `server.ts`.
 *
 * Проверяем ТЕКСТ файлов, а не поведение: импорт `server.ts` тянет весь граф
 * модулей и под общей нагрузкой не укладывается в таймаут, а дефект здесь
 * ровно текстовый — забытая строка.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/** Ключи, которые обязаны быть проведены во все слои. */
const WIRED = [
  "X10_PARTNERS_ENABLED",
  "X10_PARTNER_SLUGS",
  "X10_BASE_DOMAIN",
  // Магазин (спека 7). Ключи вписывает владелец в .env.production: платёжные
  // секреты в репозитории не живут. Проводка обязана быть в коде заранее —
  // иначе ключи в контейнере окажутся, а оплата молча не заработает.
  "YOOKASSA_SHOP_ID",
  "YOOKASSA_SECRET_KEY",
] as const;

const LAYERS: Array<{ name: string; file: string; pattern: (k: string) => RegExp }> = [
  {
    name: "схема @x10/config",
    file: "packages/config/src/env.ts",
    pattern: (k) => new RegExp(`${k}\\s*:`),
  },
  {
    name: "интерфейс AppBindings",
    file: "apps/api/src/bindings.ts",
    pattern: (k) => new RegExp(`${k}\\?*\\s*:`),
  },
  {
    name: "server.ts (process.env → биндинги)",
    file: "apps/api/src/server.ts",
    pattern: (k) => new RegExp(`${k}\\s*:\\s*process\\.env\\.${k}`),
  },
  {
    name: "getEnv (биндинги → env)",
    file: "apps/api/src/env.ts",
    pattern: (k) => new RegExp(`${k}\\s*:\\s*bindings\\.${k}`),
  },
  {
    name: "docker-compose.prod.yml",
    file: "docker-compose.prod.yml",
    pattern: (k) => new RegExp(`${k}\\s*:`),
  },
];

describe("env-ключ проведён через все пять слоёв", () => {
  for (const key of WIRED) {
    it(`🔴 ${key} доезжает от контейнера до кода`, () => {
      for (const layer of LAYERS) {
        expect(
          layer.pattern(key).test(read(layer.file)),
          `${key} не вписан в слой «${layer.name}» (${layer.file}) — в контейнере ключ есть, в коде его нет`,
        ).toBe(true);
      }
    });
  }
});
