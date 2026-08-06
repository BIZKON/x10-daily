"use server";

import { adminMutate } from "@/lib/api";
import { revalidatePath } from "next/cache";
import type { SourceFormState } from "./form-state";

/**
 * Источники парсинга — ленты, из которых конвейер делает посты.
 *
 * 🔴 Добавление источника НЕ включает его. Свежий источник не имеет ни одной
 * записи в реестре «уже виденного», поэтому первый тик приёмки принял бы весь
 * исторический фид за новости и выстрелил бы в канал бэклогом за месяцы.
 * Источник включает конвейер — после того, как фид реально прочитан. Отсюда
 * состояние «Проверяется» сразу после добавления.
 */

export async function createSource(
  _prev: SourceFormState,
  form: FormData,
): Promise<SourceFormState> {
  const name = String(form.get("name") ?? "").trim();
  const url = String(form.get("url") ?? "").trim();
  if (!name || !url) {
    return { status: "error", message: "Название и адрес обязательны." };
  }

  const res = await adminMutate<{ id: string }>("POST", "/v1/admin/sources", {
    name,
    url,
    adapterType: String(form.get("adapterType") ?? "rss"),
    tier: String(form.get("tier") ?? "secondary"),
    locale: String(form.get("locale") ?? "ru"),
    pollIntervalSec: Number(form.get("pollIntervalSec") ?? 900),
    notes: String(form.get("notes") ?? "").trim() || undefined,
  });

  if (!res.ok) {
    if (res.status === 409) {
      return { status: "error", message: "Такой адрес уже добавлен." };
    }
    return { status: "error", message: `Не удалось добавить: ${res.error}` };
  }

  revalidatePath("/sources");
  return { status: "checking" };
}

/** Включить/выключить источник. Непроверенный включить нельзя — api вернёт 409. */
export async function toggleSource(id: string, enabled: boolean) {
  const res = await adminMutate("PATCH", `/v1/admin/sources/${encodeURIComponent(id)}`, {
    enabled,
  });
  if (!res.ok) throw new Error(res.error);
  revalidatePath("/sources");
}

/**
 * Удалить источник. Реестр «уже виденного» уходит вместе с ним — заведённый
 * заново тот же адрес будет проверяться и приминаться с нуля.
 */
export async function deleteSource(id: string) {
  const res = await adminMutate("DELETE", `/v1/admin/sources/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(res.error);
  revalidatePath("/sources");
}
