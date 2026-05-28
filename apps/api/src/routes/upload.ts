import { Hono } from "hono";
import type { AppEnv } from "../app";
import { EDITOR_ROLES, requireRole } from "../auth";
import { getDb } from "../db";
import { getEnv, getImagesConfig } from "../env";

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
 *   - mime in image/png, image/jpeg, image/webp, image/gif, image/svg+xml
 *   - size ≤ 5 MB
 *
 * Key структура: {YYYY}/{MM}/{userId}/{timestamp}-{random}.{ext}
 * Это даёт хронологическую раскладку + изоляцию per editor для аудита.
 */

const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

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
    return c.json(
      { error: "file_too_large", maxBytes: MAX_BYTES, actualBytes: file.size },
      413,
    );
  }

  const mime = file.type.toLowerCase();
  const ext = ALLOWED_MIME[mime];
  if (!ext) {
    return c.json(
      { error: "unsupported_mime", mime, allowed: Object.keys(ALLOWED_MIME) },
      415,
    );
  }

  const key = buildKey(userId, ext);
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

  return c.json({
    url: `${images.publicBase}/${key}`,
    key,
    contentType: mime,
    size: file.size,
  });
});
