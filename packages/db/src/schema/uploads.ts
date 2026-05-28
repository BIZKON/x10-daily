import { bigint, index, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { users } from "./users";

/**
 * Audit-log всех успешных upload'ов через POST /v1/admin/upload.
 *
 * Назначение (HIGH-7 из docs/SECURITY-AUDIT.md):
 * 1. Per-user quota counter — rolling 24h SUM/COUNT per userId.
 *    Cap: 100 файлов · 500 MB / сутки. См. apps/api/src/upload-quota.ts.
 * 2. Audit trail для редколлегии: видно кто/что/когда залил, можно отозвать
 *    содержимое (DELETE из R2 + row сохраняется как факт инцидента).
 *
 * Не записываем: User-Agent, Referer, IP — это privacy, и для quota не нужно.
 * userId уже верифицирован через Bearer + requireRole(EDITOR_ROLES) до записи.
 *
 * Cleanup: cron-job для DELETE rows старше 90 дней — отдельная задача (LOW backlog),
 * сейчас неограниченное хранение приемлемо (ожидаемый объём ~50 rows/день).
 */
export const uploadsLog = pgTable(
  "uploads_log",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Оригинальное имя файла от клиента (slice 256 для безопасности). */
    filename: varchar("filename", { length: 256 }).notNull(),
    contentType: varchar("content_type", { length: 64 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    /** R2 object key — для возможности DELETE из R2 при revoke. */
    r2Key: text("r2_key").notNull(),
    /** Публичный URL (X10_IMAGES_PUBLIC_BASE + key). null если bucket без custom domain. */
    publicUrl: text("public_url"),
    ...timestamps,
  },
  (t) => [
    // Composite index для quota query: WHERE userId=$1 AND createdAt > now() - '24h'.
    // Postgres использует это как range scan, O(log n + matching) на small subset.
    index("uploads_log_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export type UploadLog = typeof uploadsLog.$inferSelect;
export type NewUploadLog = typeof uploadsLog.$inferInsert;
