import { sql } from "drizzle-orm";
import type { Database } from "./client";
import { type PostingControl, postingControl } from "./schema/posting_control";
import { eq } from "./sql";

/**
 * Хелперы singleton-конфига автопостинга (session 20). Используются и воркером
 * (гейт ingest-rss/post-to-tg), и API (admin GET/PUT). Чистая логика
 * isPostingPaused тестируется без БД.
 */

const SINGLETON_ID = "global";

/** Fail-open дефолт, если строки нет (миграция её сидит; это страховка). */
export const DEFAULT_POSTING_CONTROL: PostingControl = {
  id: SINGLETON_ID,
  paused: false,
  quietEnabled: false,
  quietStartHour: 21,
  quietEndHour: 9,
  updatedAt: new Date(0),
};

export type PostingControlPatch = Partial<
  Pick<PostingControl, "paused" | "quietEnabled" | "quietStartHour" | "quietEndHour">
>;

export async function getPostingControl(db: Database): Promise<PostingControl> {
  const [row] = await db
    .select()
    .from(postingControl)
    .where(eq(postingControl.id, SINGLETON_ID))
    .limit(1);
  return row ?? DEFAULT_POSTING_CONTROL;
}

export async function setPostingControl(
  db: Database,
  patch: PostingControlPatch,
): Promise<PostingControl> {
  const [row] = await db
    .insert(postingControl)
    .values({ id: SINGLETON_ID, ...patch, updatedAt: sql`now()` })
    .onConflictDoUpdate({
      target: postingControl.id,
      set: { ...patch, updatedAt: sql`now()` },
    })
    .returning();
  if (!row) throw new Error("setPostingControl: upsert returned no rows");
  return row;
}

/** Час МСК (UTC+3, круглый год) для `now`. */
export function mskHour(now: Date): number {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).getUTCHours();
}

export type PauseReason = "manual" | "quiet-hours";
export type PauseState = { paused: boolean; reason: PauseReason | null };

/**
 * Минимальный набор полей для isPostingPaused — только то, что нужно логике.
 * Шире PostingControl: принимает и JSONified-версию (после Inngest step.run,
 * где updatedAt сериализуется в string). Все поля примитивны.
 */
export type PostingControlState = Pick<
  PostingControl,
  "paused" | "quietEnabled" | "quietStartHour" | "quietEndHour"
>;

/**
 * Должен ли конвейер быть на паузе сейчас? Чистая функция (без БД/времени-сайд-
 * эффектов — `now` передаётся). Ручная пауза приоритетнее. Тихое окно — с
 * переносом через полночь (start>end, напр. 21→09). start===end → окно
 * игнорируется (страховка от случайной круглосуточной паузы).
 */
export function isPostingPaused(ctrl: PostingControlState, now: Date): PauseState {
  if (ctrl.paused) return { paused: true, reason: "manual" };
  if (ctrl.quietEnabled && ctrl.quietStartHour !== ctrl.quietEndHour) {
    const h = mskHour(now);
    const s = ctrl.quietStartHour;
    const e = ctrl.quietEndHour;
    const inWindow = s < e ? h >= s && h < e : h >= s || h < e;
    if (inWindow) return { paused: true, reason: "quiet-hours" };
  }
  return { paused: false, reason: null };
}
