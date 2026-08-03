"use server";

import { adminMutate } from "@/lib/api";
import { revalidatePath } from "next/cache";

/**
 * Решения редактора по ИИ-обложке (Спека 2) — HumanGate на картинку.
 *
 * 🔴 «Одобрить» — единственный путь, которым сгенерированная картинка попадает
 * в канал (CLAUDE.md §4: AI не публикует автономно). Конвейер сам ставит только
 * `pending_review`.
 */

/** Одобрить обложку → уйдёт фото-постом в канал и станет обложкой в ленте. */
export async function approveVisual(articleId: string) {
  const res = await adminMutate(
    "POST",
    `/v1/admin/visuals/${encodeURIComponent(articleId)}/approve`,
  );
  if (!res.ok) {
    // 409 — статья уже не ждёт ревью (двойной клик / решение принято в другой
    // вкладке). Говорим это прямо, а не «неизвестная ошибка».
    if (res.status === 409) {
      throw new Error("Обложка уже не ждёт ревью — обнови страницу.");
    }
    throw new Error(`Не удалось одобрить: ${res.error}`);
  }
  revalidatePath("/visuals");
}

/** Без картинки: пост уйдёт текстом, в ленте останется брендовая обложка. */
export async function rejectVisual(articleId: string) {
  const res = await adminMutate(
    "POST",
    `/v1/admin/visuals/${encodeURIComponent(articleId)}/reject`,
  );
  if (!res.ok) throw new Error(`Не удалось отклонить: ${res.error}`);
  revalidatePath("/visuals");
}

/**
 * Перегенерировать. Уходит событие с force=true; новая картинка снова придёт
 * на ревью. Готова не мгновенно — экран обновится по «Обновить».
 */
export async function regenerateVisual(articleId: string) {
  const res = await adminMutate(
    "POST",
    `/v1/admin/visuals/${encodeURIComponent(articleId)}/regenerate`,
  );
  if (!res.ok) throw new Error(`Не удалось запустить перегенерацию: ${res.error}`);
  revalidatePath("/visuals");
}
