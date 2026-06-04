"use server";

import { type PostingControl, adminMutate } from "@/lib/api";
import { revalidatePath } from "next/cache";

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
