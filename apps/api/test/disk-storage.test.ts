import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DiskStorage } from "../src/services/disk-storage";

/**
 * Хранилище загрузок на диске тома — замена так и не подключённого после
 * переезда с Cloudflare R2 слоя (аватар автора падал с `r2_not_configured`).
 */

async function tmpRoot() {
  return await mkdtemp(join(tmpdir(), "uploads-"));
}

describe("DiskStorage.put", () => {
  it("пишет файл по ключу, создавая вложенные каталоги", async () => {
    const root = await tmpRoot();
    const s = new DiskStorage(root);
    await s.put("2026/08/user-1/123-abcd.png", new Uint8Array([1, 2, 3]));

    const bytes = await readFile(join(root, "2026/08/user-1/123-abcd.png"));
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  it("принимает Web ReadableStream (тело формы приходит потоком)", async () => {
    const root = await tmpRoot();
    const s = new DiskStorage(root);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([7, 7]));
        c.enqueue(new Uint8Array([9]));
        c.close();
      },
    });
    await s.put("a/b.png", stream);

    const bytes = await readFile(join(root, "a/b.png"));
    expect([...bytes]).toEqual([7, 7, 9]);
  });

  it("🔴 ключ с ../ не пишет за пределы каталога", async () => {
    const root = await tmpRoot();
    const s = new DiskStorage(root);
    await expect(s.put("../../pwned.png", new Uint8Array([1]))).rejects.toThrow(/за пределы/i);
    expect(await readdir(root)).toHaveLength(0);
  });

  it("🔴 абсолютный ключ тоже отвергается", async () => {
    const root = await tmpRoot();
    const s = new DiskStorage(root);
    await expect(s.put("/etc/passwd", new Uint8Array([1]))).rejects.toThrow(/за пределы/i);
  });
});
