import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { coverFileName, coverVersion, coversEnabled, saveCover } from "../src/lib/cover-storage";

async function tmpEnv() {
  const dir = await mkdtemp(join(tmpdir(), "covers-"));
  return { dir, env: { COVERS_DIR: dir, COVERS_PUBLIC_BASE_URL: "https://app.example.ru/covers" } };
}

describe("coverFileName", () => {
  it("имя файла детерминировано по articleId и расширению mime", () => {
    expect(coverFileName("a1b2", "image/jpeg", "deadbeef")).toBe("a1b2-deadbeef.jpg");
    expect(coverFileName("a1b2", "image/png", "deadbeef")).toBe("a1b2-deadbeef.png");
  });

  it("неизвестный mime → .jpg (шлюз отдаёт jpeg)", () => {
    expect(coverFileName("a1b2", "image/heic", "deadbeef")).toBe("a1b2-deadbeef.jpg");
  });

  it("🔴 path traversal в articleId отвергается, а не пишет мимо каталога", () => {
    expect(() => coverFileName("../../etc/passwd", "image/jpeg", "deadbeef")).toThrow(/articleId/i);
    expect(() => coverFileName("a/b", "image/jpeg", "deadbeef")).toThrow(/articleId/i);
    expect(() => coverFileName("", "image/jpeg", "deadbeef")).toThrow(/articleId/i);
  });
});

describe("coversEnabled", () => {
  it("оба ключа заданы → включено", () => {
    expect(coversEnabled({ COVERS_DIR: "/d", COVERS_PUBLIC_BASE_URL: "https://a/c" })).toBe(true);
  });

  it("любой пустой → выключено (генерация не стартует)", () => {
    expect(coversEnabled({ COVERS_DIR: "/d", COVERS_PUBLIC_BASE_URL: "" })).toBe(false);
    expect(coversEnabled({ COVERS_DIR: "", COVERS_PUBLIC_BASE_URL: "https://a/c" })).toBe(false);
    expect(coversEnabled({})).toBe(false);
  });
});

describe("saveCover", () => {
  it("пишет файл и возвращает публичный URL", async () => {
    const { dir, env } = await tmpEnv();
    const url = await saveCover(env, "a1", new Uint8Array([1, 2, 3]), "image/jpeg");
    expect(url).toMatch(/^https:\/\/app\.example\.ru\/covers\/a1-[0-9a-f]{8}\.jpg$/);
    expect((await readdir(dir))[0]).toMatch(/^a1-[0-9a-f]{8}\.jpg$/);
  });

  it("создаёт каталог, если его нет", async () => {
    const { dir, env } = await tmpEnv();
    const nested = join(dir, "deep", "nested");
    const url = await saveCover(
      { ...env, COVERS_DIR: nested },
      "a2",
      new Uint8Array([9]),
      "image/png",
    );
    expect(url).toMatch(/^https:\/\/app\.example\.ru\/covers\/a2-[0-9a-f]{8}\.png$/);
    expect(await readdir(nested)).toHaveLength(1);
  });

  it("не дублирует слэш, если публичный URL заканчивается на /", async () => {
    const { env } = await tmpEnv();
    const url = await saveCover(
      { ...env, COVERS_PUBLIC_BASE_URL: "https://app.example.ru/covers/" },
      "a3",
      new Uint8Array([1]),
      "image/jpeg",
    );
    expect(url).toMatch(/^https:\/\/app\.example\.ru\/covers\/a3-[0-9a-f]{8}\.jpg$/);
  });

  it("та же картинка повторно → тот же файл, без дублей", async () => {
    const { dir, env } = await tmpEnv();
    const a = await saveCover(env, "a4", new Uint8Array([1, 1, 1, 1]), "image/jpeg");
    const b = await saveCover(env, "a4", new Uint8Array([1, 1, 1, 1]), "image/jpeg");
    expect(a).toBe(b);
    expect(await readdir(dir)).toHaveLength(1);
  });

  it("🔴 URL обложки НЕ содержит query — иначе Telegram её не примет", async () => {
    const { env } = await tmpEnv();
    const url = await saveCover(env, "a8", new Uint8Array([7, 7]), "image/jpeg");
    expect(url).not.toContain("?");
  });

  it("хранилище не сконфигурировано → бросает (вызывающий обязан гейтить coversEnabled)", async () => {
    await expect(saveCover({}, "a5", new Uint8Array([1]), "image/jpeg")).rejects.toThrow(/COVERS/);
  });

  it("🔴 path traversal не пишет за пределы каталога обложек", async () => {
    const { env } = await tmpEnv();
    await expect(saveCover(env, "../../pwned", new Uint8Array([1]), "image/jpeg")).rejects.toThrow(
      /articleId/i,
    );
  });
});

describe("coverVersion — версия содержимого в URL", () => {
  it("одинаковые байты → одинаковая версия (URL не дёргается зря)", () => {
    expect(coverVersion(new Uint8Array([1, 2, 3]))).toBe(coverVersion(new Uint8Array([1, 2, 3])));
  });

  it("🔴 разные байты → разная версия: перегенерация обязана пробить immutable-кэш", () => {
    expect(coverVersion(new Uint8Array([1, 2, 3]))).not.toBe(
      coverVersion(new Uint8Array([3, 2, 1])),
    );
  });

  it("🔴 перегенерация даёт ДРУГОЙ файл — одобренные байты не подменяются", async () => {
    const { dir, env } = await tmpEnv();
    const first = await saveCover(env, "a9", new Uint8Array([1, 1, 1]), "image/jpeg");
    const second = await saveCover(env, "a9", new Uint8Array([2, 2, 2]), "image/jpeg");
    expect(first).not.toBe(second);
    // Старый файл на месте: URL, одобренный редактором, продолжает отдавать
    // ровно те байты, которые он видел.
    expect(await readdir(dir)).toHaveLength(2);
  });
});
