import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { ObjectStorage } from "../bindings";

/**
 * Хранилище загрузок на диске тома — тот же приём, что у ИИ-обложек
 * (`lib/cover-storage.ts` в pipeline): api пишет в том, Caddy раздаёт его
 * read-only по публичному пути.
 *
 * Зачем не S3. Слой `ObjectStorage` пришёл из эпохи Cloudflare R2, и с переездом
 * на Timeweb остался ни к чему не подключённым: `S3_*` в проде не заданы, и
 * загрузка аватара падала с `r2_not_configured` — то есть не работала НИКОГДА
 * после переезда. Заводить ради нескольких аватаров внешний бакет (деньги,
 * ключи, ещё одна граница 152-ФЗ) несоразмерно: файлы малы, редки и уже лежат
 * на той же РФ-машине, что и обложки.
 *
 * S3-путь при этом сохранён: заданы `S3_*` → используется он, это приоритетный
 * вариант, когда файлов станет много.
 */
export class DiskStorage implements ObjectStorage {
  constructor(private readonly rootDir: string) {}

  async put(
    key: string,
    body: ReadableStream | Uint8Array | Buffer,
    _opts?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<void> {
    // Ключ строит сервер (`buildKey`), но полагаться на это нельзя: одна будущая
    // правка, пускающая в ключ пользовательский ввод, превратила бы `../` в
    // запись куда угодно по файловой системе контейнера.
    //
    // ⚠️ Абсолютный ключ отсекаем ОТДЕЛЬНО: `join(root, "/etc/passwd")` даёт
    // `root/etc/passwd` — ведущий слэш просто съедается, проверка границ
    // проходит, и файл молча ложится не туда, куда указывал ключ. Публичный
    // URL при этом получил бы двойной слэш. Лучше отказать явно.
    if (key.startsWith("/") || key.startsWith("\\")) {
      throw new Error(`DiskStorage: ключ выходит за пределы каталога (абсолютный): ${key}`);
    }
    const root = resolve(this.rootDir);
    const target = resolve(join(root, key));
    if (target !== root && !target.startsWith(root + sep)) {
      throw new Error(`DiskStorage: ключ выходит за пределы каталога: ${key}`);
    }

    const bytes = await toBytes(body);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
}

async function toBytes(body: ReadableStream | Uint8Array | Buffer): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (Buffer.isBuffer(body)) return body;

  // Web ReadableStream → байты. Аккумулировать целиком безопасно: маршрут
  // загрузки уже отсёк всё крупнее MAX_BYTES (5 МБ) до вызова put.
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
