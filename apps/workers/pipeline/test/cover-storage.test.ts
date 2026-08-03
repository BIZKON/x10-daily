import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { coverFileName, coversEnabled, saveCover } from "../src/lib/cover-storage";

async function tmpEnv() {
  const dir = await mkdtemp(join(tmpdir(), "covers-"));
  return { dir, env: { COVERS_DIR: dir, COVERS_PUBLIC_BASE_URL: "https://app.example.ru/covers" } };
}

describe("coverFileName", () => {
  it("имя файла детерминировано по articleId и расширению mime", () => {
    expect(coverFileName("a1b2", "image/jpeg")).toBe("a1b2.jpg");
    expect(coverFileName("a1b2", "image/png")).toBe("a1b2.png");
  });

  it("неизвестный mime → .jpg (шлюз отдаёт jpeg)", () => {
    expect(coverFileName("a1b2", "image/heic")).toBe("a1b2.jpg");
  });

  it("🔴 path traversal в articleId отвергается, а не пишет мимо каталога", () => {
    expect(() => coverFileName("../../etc/passwd", "image/jpeg")).toThrow(/articleId/i);
    expect(() => coverFileName("a/b", "image/jpeg")).toThrow(/articleId/i);
    expect(() => coverFileName("", "image/jpeg")).toThrow(/articleId/i);
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
    expect(url).toBe("https://app.example.ru/covers/a1.jpg");
    expect((await readFile(join(dir, "a1.jpg"))).length).toBe(3);
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
    expect(url).toBe("https://app.example.ru/covers/a2.png");
    expect(await readdir(nested)).toContain("a2.png");
  });

  it("не дублирует слэш, если публичный URL заканчивается на /", async () => {
    const { env } = await tmpEnv();
    const url = await saveCover(
      { ...env, COVERS_PUBLIC_BASE_URL: "https://app.example.ru/covers/" },
      "a3",
      new Uint8Array([1]),
      "image/jpeg",
    );
    expect(url).toBe("https://app.example.ru/covers/a3.jpg");
  });

  it("перезапись той же статьи идемпотентна — один файл, свежие байты", async () => {
    const { dir, env } = await tmpEnv();
    await saveCover(env, "a4", new Uint8Array([1, 1, 1, 1]), "image/jpeg");
    await saveCover(env, "a4", new Uint8Array([2, 2]), "image/jpeg");
    expect(await readdir(dir)).toEqual(["a4.jpg"]);
    expect((await readFile(join(dir, "a4.jpg"))).length).toBe(2);
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
