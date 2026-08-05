import { createHash } from "node:crypto";
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

/**
 * Имя файла обложки: `<articleId>-<версия>.<ext>`, где версия — хеш содержимого.
 *
 * ⚠️ Версия именно в ИМЕНИ, а не в query (`?v=…`), и это не косметика:
 *  1. Telegram НЕ принимает sendPhoto по URL с query-хвостом — отвечает
 *     «Bad Request: wrong type of the web page content» (проверено вживую:
 *     тот же файл без query проходит). Тип он определяет по URL.
 *  2. Query не закрепляет содержимое: Caddy резолвит файл по пути и query
 *     игнорирует, поэтому перегенерация подменяла байты под уже одобренным
 *     редактором URL.
 * Плата: старые версии остаются на диске (перегенерация не перезаписывает).
 */
export function coverFileName(articleId: string, mime: string, version: string): string {
  if (!SAFE_ID.test(articleId)) {
    throw new Error(
      `coverFileName: недопустимый articleId «${articleId}» — ожидались только [A-Za-z0-9_-].`,
    );
  }
  if (!/^[0-9a-f]{6,32}$/.test(version)) {
    throw new Error(`coverFileName: недопустимая версия «${version}» — ожидался hex-хеш.`);
  }
  const ext = EXT_BY_MIME[mime.toLowerCase()] ?? "jpg";
  return `${articleId}-${version}.${ext}`;
}

/**
 * Версия содержимого — короткий хеш байтов, попадает в ИМЯ файла.
 *
 * Зачем: Caddy раздаёт обложки с `immutable` и годовым max-age. Без версии
 * перегенерация оставалась бы невидимой — браузеры и кэш Telegram держали бы
 * старую картинку. Хеш меняет URL ровно тогда, когда изменились байты.
 */
export function coverVersion(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 8);
}

/**
 * Пишет байты обложки на диск и возвращает её публичный URL.
 *
 * Идемпотентно по СОДЕРЖИМОМУ: те же байты → то же имя → тот же URL, файл
 * просто перезаписывается собой. Другие байты → другое имя, старый файл
 * остаётся: одобренный редактором URL продолжает отдавать ровно те байты,
 * которые он видел.
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
  const name = coverFileName(articleId, mime, coverVersion(bytes));

  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), bytes);

  // URL БЕЗ query — иначе Telegram откажется брать картинку (см. coverFileName).
  return `${publicBase.replace(/\/+$/, "")}/${name}`;
}
