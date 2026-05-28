/**
 * Per-user upload quota (HIGH-7 из docs/SECURITY-AUDIT.md).
 *
 * Rolling 24h window:
 *  - max 100 файлов
 *  - max 500 MB суммарно
 *
 * Применяется поверх `requireRole(EDITOR_ROLES)` в upload route — значит
 * квота шире чем "сколько может загрузить anonymous", это страховка от
 * compromised editor account или скрипта от инсайдера.
 *
 * Реализация через `uploads_log` таблицу (audit trail + counter). Запрос
 * COUNT/SUM по composite index `(user_id, created_at)` — O(log + matching).
 * Стоимость одной проверки: ~5-10ms на Neon Frankfurt.
 *
 * См. packages/db/src/schema/uploads.ts и migration 0005.
 */
import { and, eq, gte, sql, uploadsLog } from "@x10/db";
import type { Database } from "@x10/db";

export const QUOTA_FILES_PER_DAY = 100;
export const QUOTA_BYTES_PER_DAY = 500 * 1024 * 1024; // 500 MB
const QUOTA_WINDOW_SECONDS = 24 * 60 * 60;

export type QuotaCurrent = { files: number; bytes: number };

export type QuotaCheck =
  | { allowed: true; current: QuotaCurrent }
  | {
      allowed: false;
      reason: "files_exceeded" | "bytes_exceeded";
      current: QuotaCurrent;
      limit: number;
      resetSeconds: number;
    };

/**
 * Возвращает текущее использование квоты за rolling 24h.
 * Если `additionalBytes` задан — проверяет также, влезет ли запланированная загрузка.
 */
export async function checkUploadQuota(
  db: Database,
  userId: string,
  additionalBytes: number,
): Promise<QuotaCheck> {
  const [row] = await db
    .select({
      files: sql<number>`count(*)::int`,
      bytes: sql<string>`coalesce(sum(${uploadsLog.sizeBytes}), 0)::text`,
    })
    .from(uploadsLog)
    .where(
      and(
        eq(uploadsLog.userId, userId),
        gte(uploadsLog.createdAt, sql`now() - interval '24 hours'`),
      ),
    );

  // bigint sum приходит как string из Postgres — приводим к number.
  // 500 MB << Number.MAX_SAFE_INTEGER, безопасно.
  const files = row?.files ?? 0;
  const bytes = Number(row?.bytes ?? "0");
  const current: QuotaCurrent = { files, bytes };

  if (files >= QUOTA_FILES_PER_DAY) {
    return {
      allowed: false,
      reason: "files_exceeded",
      current,
      limit: QUOTA_FILES_PER_DAY,
      resetSeconds: QUOTA_WINDOW_SECONDS,
    };
  }
  if (bytes + additionalBytes > QUOTA_BYTES_PER_DAY) {
    return {
      allowed: false,
      reason: "bytes_exceeded",
      current,
      limit: QUOTA_BYTES_PER_DAY,
      resetSeconds: QUOTA_WINDOW_SECONDS,
    };
  }
  return { allowed: true, current };
}

/**
 * Записывает успешный upload в audit log. Вызывается ПОСЛЕ R2 put — не до,
 * чтобы счётчик отражал реально загруженное, не failed-попытки.
 *
 * Если INSERT упадёт — R2 объект остался, но quota не учтена. Это acceptable
 * trade-off: лучше один лишний файл, чем потерянный audit row.
 */
export async function recordUpload(
  db: Database,
  data: {
    userId: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    r2Key: string;
    publicUrl?: string | null;
  },
): Promise<void> {
  await db.insert(uploadsLog).values({
    userId: data.userId,
    filename: data.filename.slice(0, 256),
    contentType: data.contentType.slice(0, 64),
    sizeBytes: data.sizeBytes,
    r2Key: data.r2Key,
    publicUrl: data.publicUrl ?? null,
  });
}
