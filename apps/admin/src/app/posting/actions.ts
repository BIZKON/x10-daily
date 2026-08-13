"use server";

import { type PostingControl, adminMutate } from "@/lib/api";
import { revalidatePath } from "next/cache";
import { MIN_REJECT_REASON, type PostingFormState } from "./form-state";

/**
 * Обновляет стоп-кран автопостинга (session 20). Конвейер (ingest-rss + post-to-tg)
 * читает posting_control на лету — эффект мгновенный, без редеплоя.
 */
export async function updatePostingControl(form: FormData) {
  const paused = form.get("paused") === "on";
  const quietEnabled = form.get("quietEnabled") === "on";
  const quietStartHour = Number(form.get("quietStartHour"));
  const quietEndHour = Number(form.get("quietEndHour"));
  for (const [k, v] of [
    ["quietStartHour", quietStartHour],
    ["quietEndHour", quietEndHour],
  ] as const) {
    if (!Number.isInteger(v) || v < 0 || v > 23) {
      throw new Error(`${k}: час должен быть целым 0..23`);
    }
  }
  const res = await adminMutate<PostingControl>("PUT", "/v1/admin/posting-control", {
    paused,
    quietEnabled,
    quietStartHour,
    quietEndHour,
  });
  if (!res.ok) throw new Error(`Не удалось сохранить: ${res.error}`);
  revalidatePath("/posting");
}

/**
 * Отметить, что публикацию сняла площадка (спека 13.08, реестр §3.12).
 *
 * Причина обязательна: «сняли» без причины не помогает ни повторить, ни не
 * повторить. Права проверяет сервер api (`content.publish`), а не эта функция —
 * спрятанная кнопка не защита.
 */
export async function rejectPublication(
  _prev: PostingFormState,
  formData: FormData,
): Promise<PostingFormState> {
  const id = String(formData.get("id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id) return { status: "error", message: "Не указана публикация." };
  if (reason.length < MIN_REJECT_REASON) {
    return { status: "error", message: "Напишите, почему площадка сняла публикацию." };
  }

  const res = await adminMutate(
    "POST",
    `/v1/admin/posting/publications/${encodeURIComponent(id)}/reject`,
    { reason },
  );
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/posting");
  return { status: "ok", message: "Отмечено снятым." };
}

/**
 * Вернуть снятую публикацию в очередь: следующий слот заберёт её снова.
 *
 * След снятия (когда и почему) остаётся в строке — иначе второй заход выглядел
 * бы первым, и та же причина повторилась бы.
 */
export async function requeuePublication(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Не указана публикация.");

  const res = await adminMutate(
    "POST",
    `/v1/admin/posting/publications/${encodeURIComponent(id)}/requeue`,
  );
  if (!res.ok) throw new Error(`Не удалось вернуть в очередь: ${res.error}`);

  revalidatePath("/posting");
}
