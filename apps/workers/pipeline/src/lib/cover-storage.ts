import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Хранилище сгенерированных обложек (Спека 2).
 *
 * Сегодня — диск прод-VM (docker-том `covers`), раздаёт Caddy по
 * `COVERS_PUBLIC_BASE_URL`. Решение владельца: стартуем без S3-кредов.
 *
 * Абстракция намеренно УЗКАЯ — ровно `saveCover` + `coversEnabled`. Переезд на
 * S3 = замена тела `saveCover` (положить байты, вернуть публичный URL);
 * вызывающий код и схема БД не меняются.
 *
 * Новых зависимостей нет — только `node:fs/promises` (CLAUDE.md §8).
 */

/** Узкий срез env — структурно совместим с PipelineEnv, тестируется без каста. */
export type CoverStorageEnv = {
  COVERS_DIR?: string;
  COVERS_PUBLIC_BASE_URL?: string;
};

/** Расширение по mime; шлюз отдаёт jpeg, остальное — на всякий случай. */
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * articleId попадает в путь на диске И в публичный URL. Пускаем только тот
 * алфавит, которым реально выглядит id статьи (uuid/nanoid): буквы, цифры,
 * дефис, подчёркивание. Это защита от `../` и от слэша, уводящего запись за
 * пределы каталога обложек, — не полагаемся на то, что id всегда приходит из БД.
 */
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Генерация включена только когда заданы ОБА ключа: каталог для записи и
 * публичный база-URL раздачи. Пусто → конвейер работает как раньше (текстовые
 * посты, BrandedCover в ленте).
 */
export function coversEnabled(env: CoverStorageEnv): boolean {
  return Boolean(env.COVERS_DIR && env.COVERS_PUBLIC_BASE_URL);
}

/** Детерминированное имя файла обложки: `<articleId>.<ext>`. */
export function coverFileName(articleId: string, mime: string): string {
  if (!SAFE_ID.test(articleId)) {
    throw new Error(
      `coverFileName: недопустимый articleId «${articleId}» — ожидались только [A-Za-z0-9_-].`,
    );
  }
  const ext = EXT_BY_MIME[mime.toLowerCase()] ?? "jpg";
  return `${articleId}.${ext}`;
}

/**
 * Пишет байты обложки на диск и возвращает её публичный URL.
 * Перезапись идемпотентна: имя детерминировано по articleId, поэтому
 * перегенерация заменяет файл, а не плодит мусор.
 */
export async function saveCover(
  env: CoverStorageEnv,
  articleId: string,
  bytes: Uint8Array,
  mime: string,
): Promise<string> {
  const dir = env.COVERS_DIR;
  const publicBase = env.COVERS_PUBLIC_BASE_URL;
  if (!dir || !publicBase) {
    throw new Error(
      "saveCover: COVERS_DIR / COVERS_PUBLIC_BASE_URL не заданы — вызывающий обязан проверить coversEnabled().",
    );
  }
  // Валидация ДО mkdir: битый id не должен создавать каталоги.
  const name = coverFileName(articleId, mime);

  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), bytes);

  return `${publicBase.replace(/\/+$/, "")}/${name}`;
}
