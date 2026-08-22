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

/**
 * Карусель — тот же HumanGate, что у обложки (реестр §3.5).
 *
 * 🔴 «Одобрить» здесь не просто меняет статус: тем же действием карусель встаёт
 * в очередь публикации. Иначе появилось бы состояние «одобрено, но никуда не
 * поставлено», в котором редактор нажал, а альбом не вышел.
 */
export async function approveCarousel(articleId: string) {
  const res = await adminMutate(
    "POST",
    `/v1/admin/carousels/${encodeURIComponent(articleId)}/approve`,
  );
  if (!res.ok) {
    // 409 — слайды ещё не нарисованы либо решение уже принято в другой вкладке.
    if (res.status === 409) {
      throw new Error("Слайды ещё не нарисованы или решение уже принято — обнови страницу.");
    }
    throw new Error(`Не удалось одобрить: ${res.error}`);
  }
  revalidatePath("/visuals");
  revalidatePath("/posting");
}

/** Отклонить: в канал альбом не пойдёт, слайды остаются для разбора. */
export async function rejectCarousel(articleId: string) {
  const res = await adminMutate(
    "POST",
    `/v1/admin/carousels/${encodeURIComponent(articleId)}/reject`,
  );
  if (!res.ok) throw new Error(`Не удалось отклонить: ${res.error}`);
  revalidatePath("/visuals");
}

/** Нарисовать заново. Платный прогон модели — поэтому только руками. */
export async function makeCarousel(articleId: string) {
  const res = await adminMutate(
    "POST",
    `/v1/admin/carousels/${encodeURIComponent(articleId)}/make`,
  );
  if (!res.ok) throw new Error(`Не удалось запустить: ${res.error}`);
  revalidatePath("/visuals");
}
