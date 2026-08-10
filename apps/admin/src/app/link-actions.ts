"use server";

import { adminMutate } from "@/lib/api";
import { revalidatePath } from "next/cache";
import type { LinkFormState } from "./link-form-state";

/**
 * Разбор материала по ссылке — второй вход конвейера.
 *
 * Сама работа идёт в воркере: загрузка страницы, разбор приёма и постановка
 * темы. Здесь только передача адреса и человеческий ответ на отказ.
 */
export async function submitLink(_prev: LinkFormState, form: FormData): Promise<LinkFormState> {
  const url = String(form.get("url") ?? "").trim();
  if (!url) return { status: "error", message: "Вставьте ссылку на материал." };

  const res = await adminMutate<{ hint?: string }>("POST", "/v1/admin/breakdown", { url });

  if (!res.ok) {
    if (res.status === 429) {
      return { status: "error", message: "Слишком часто. Подождите минуту и попробуйте снова." };
    }
    return {
      status: "error",
      message: res.error ?? "Не удалось принять ссылку. Проверьте адрес и попробуйте ещё раз.",
    };
  }

  revalidatePath("/");
  return {
    status: "ok",
    message:
      res.data?.hint ?? "Принято. Разбор занимает около минуты — материал появится в этой очереди.",
  };
}
