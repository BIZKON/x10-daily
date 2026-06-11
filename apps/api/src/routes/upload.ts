import { Hono } from "hono";
import type { AppEnv } from "../app";
import { EDITOR_ROLES, requireRole } from "../auth";
import { getDb } from "../db";
import { getEnv, getImagesConfig } from "../env";
import {
  QUOTA_BYTES_PER_DAY,
  QUOTA_FILES_PER_DAY,
  checkUploadQuota,
  recordUpload,
} from "../upload-quota";

/**
 * Upload endpoints — brief §6 Author.avatar / Article.coverImage / Event.coverImage.
 *
 * POST /v1/admin/upload — multipart/form-data, поле "file".
 * Returns: { url, key, contentType, size }.
 *
 * Storage: Cloudflare R2 bucket binding X10_IMAGES (см. wrangler.toml).
 * Public URLs строятся через X10_IMAGES_PUBLIC_BASE.
 * Если R2 не настроен → 503 c понятной инструкцией.
 *
 * Validation:
 *   - mime in image/png, image/jpeg, image/webp, image/gif (MEDIUM-3: SVG убран — XSS)
 *   - magic bytes match для proven формата (MEDIUM-2: не доверяем Content-Type клиента)
 *   - Content-Length ≤ 6 MB pre-check до буферизации (MEDIUM-5)
 *   - file.size ≤ 5 MB после буферизации
 *
 * Key структура: {YYYY}/{MM}/{userId}/{timestamp}-{random}.{ext}
 * Это даёт хронологическую раскладку + изоляцию per editor для аудита.
 */

const MAX_BYTES = 5 * 1024 * 1024;
/** Pre-check на Content-Length — слегка больше real cap из-за multipart overhead. */
const MAX_CONTENT_LENGTH = 6 * 1024 * 1024;

/**
 * MEDIUM-3: SVG drop — может содержать `<script>` и `<foreignObject>`.
 * Если когда-нибудь понадобится — serve from sandboxed subdomain
 * с Content-Security-Policy: sandbox или DOMPurify санитизацией перед put.
 */
const ALLOWED_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * MEDIUM-2: magic bytes verification. `file.type` контролируется клиентом
 * (multipart Content-Type header) — атакующий может выдать `.html` за PNG.
 * Реальный формат определяется по signature первых байт.
 *
 * https://en.wikipedia.org/wiki/List_of_file_signatures
 */
type DetectedFormat = "png" | "jpg" | "webp" | "gif";

function detectFormat(bytes: Uint8Array): DetectedFormat | null {
  if (bytes.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpg";
  }
  // GIF87a / GIF89a: 47 49 46 38 37/39 61
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "gif";
  }
  // WEBP: 'RIFF' .... 'WEBP' (52 49 46 46 ?? ?? ?? ?? 57 45 42 50)
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

function expectedFormatFromMime(mime: string): DetectedFormat | null {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return null;
  }
}

function randomString(len: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) out += chars[bytes[i]! % chars.length];
  return out;
}

function buildKey(userId: string, ext: string): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}/${m}/${userId}/${now.getTime()}-${randomString(8)}.${ext}`;
}

export const uploadRoute = new Hono<AppEnv>().post("/", async (c) => {
  const env = getEnv(c.env);
  const db = getDb(env.DATABASE_URL);
  const { userId } = await requireRole(c, db, EDITOR_ROLES);

  // HIGH-7: pre-check quota по count. Полная проверка с учётом bytes делается
  // после того как узнаем file.size — но если уже исчерпан file count, нет
  // смысла читать formData. Это короткий ранний exit (≤10ms).
  const quotaPreCheck = await checkUploadQuota(db, userId, 0);
  if (!quotaPreCheck.allowed && quotaPreCheck.reason === "files_exceeded") {
    return c.json(
      {
        error: "upload_quota_exceeded",
        reason: "files_exceeded",
        message: `Лимит ${QUOTA_FILES_PER_DAY} файлов / 24h исчерпан. Попробуйте позже.`,
        current: quotaPreCheck.current,
        limits: { files: QUOTA_FILES_PER_DAY, bytes: QUOTA_BYTES_PER_DAY },
      },
      429,
      { "Retry-After": String(quotaPreCheck.resetSeconds) },
    );
  }

  const images = getImagesConfig(c.env);
  if (!images) {
    return c.json(
      {
        error: "r2_not_configured",
        message:
          "R2 не настроен. Создай bucket: `wrangler r2 bucket create x10-images`, " +
          "раскомментируй r2_buckets в wrangler.toml, задай X10_IMAGES_PUBLIC_BASE.",
      },
      503,
    );
  }

  // MEDIUM-5: pre-check Content-Length до буферизации formData.
  // Без этого CF Workers буферизует весь body (до ~100MB лимита CF) ради
  // последующей валидации — bandwidth + memory abuse vector.
  const contentLengthRaw = c.req.header("content-length");
  if (contentLengthRaw) {
    const cl = Number.parseInt(contentLengthRaw, 10);
    if (Number.isFinite(cl) && cl > MAX_CONTENT_LENGTH) {
      return c.json(
        {
          error: "request_too_large",
          maxBytes: MAX_CONTENT_LENGTH,
          actualBytes: cl,
          message: "Content-Length превышает лимит. Используйте файл ≤ 5 MB.",
        },
        413,
      );
    }
  }

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: "invalid_form_data" }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return c.json({ error: "file_required", message: 'Поле "file" обязательно.' }, 400);
  }

  if (file.size === 0) {
    return c.json({ error: "empty_file" }, 400);
  }
  if (file.size > MAX_BYTES) {
    return c.json({ error: "file_too_large", maxBytes: MAX_BYTES, actualBytes: file.size }, 413);
  }

  // HIGH-7: финальная quota check с учётом file.size. Count уже OK из preCheck,
  // тут проверяем bytes.
  const quotaCheck = await checkUploadQuota(db, userId, file.size);
  if (!quotaCheck.allowed) {
    return c.json(
      {
        error: "upload_quota_exceeded",
        reason: quotaCheck.reason,
        message:
          quotaCheck.reason === "bytes_exceeded"
            ? `Лимит ${Math.round(QUOTA_BYTES_PER_DAY / 1024 / 1024)} MB / 24h будет превышен этой загрузкой.`
            : `Лимит ${QUOTA_FILES_PER_DAY} файлов / 24h исчерпан.`,
        current: quotaCheck.current,
        limits: { files: QUOTA_FILES_PER_DAY, bytes: QUOTA_BYTES_PER_DAY },
      },
      429,
      { "Retry-After": String(quotaCheck.resetSeconds) },
    );
  }

  const mime = file.type.toLowerCase();
  const declaredExt = ALLOWED_MIME[mime];
  if (!declaredExt) {
    return c.json({ error: "unsupported_mime", mime, allowed: Object.keys(ALLOWED_MIME) }, 415);
  }

  // MEDIUM-2: магические байты должны совпадать с заявленным MIME.
  // Защищает от: 1) выдачи html/js за png; 2) выдачи неизвестного формата
  // за разрешённый. Читаем только первые 16 байт — этого достаточно для
  // detection PNG/JPEG/GIF/WEBP.
  const headerBytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const detected = detectFormat(headerBytes);
  const expected = expectedFormatFromMime(mime);
  if (!detected || detected !== expected) {
    return c.json(
      {
        error: "mime_signature_mismatch",
        mime,
        detected,
        message: "Magic bytes файла не совпадают с Content-Type. Не пытайтесь спуфить MIME.",
      },
      415,
    );
  }

  const key = buildKey(userId, declaredExt);
  try {
    await images.bucket.put(key, file.stream(), {
      httpMetadata: {
        contentType: mime,
        cacheControl: "public, max-age=31536000, immutable",
      },
      customMetadata: {
        uploadedBy: userId,
        originalName: file.name.slice(0, 200),
      },
    });
  } catch (e) {
    return c.json(
      {
        error: "upload_failed",
        message: e instanceof Error ? e.message : "R2 put failed",
      },
      500,
    );
  }

  const publicUrl = `${images.publicBase}/${key}`;

  // HIGH-7: записываем audit row после успешного R2 put. Если INSERT упадёт —
  // R2 объект остался, но quota не учтена. Acceptable: лучше один лишний
  // файл, чем потерянный audit-row.
  try {
    await recordUpload(db, {
      userId,
      filename: file.name,
      contentType: mime,
      sizeBytes: file.size,
      r2Key: key,
      publicUrl,
    });
  } catch (e) {
    console.error("[upload] audit log INSERT failed", e instanceof Error ? e.message : e);
    // Не возвращаем 500 — пользователь получил URL, файл реально загружен.
  }

  return c.json({
    url: publicUrl,
    key,
    contentType: mime,
    size: file.size,
  });
});
