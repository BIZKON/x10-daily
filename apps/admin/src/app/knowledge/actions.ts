"use server";

import { adminMutate } from "@/lib/api";
import { revalidatePath } from "next/cache";
import type { KbFormState } from "./form-state";

/**
 * База знаний: добавление, правка и удаление материалов.
 *
 * Все три действия ходят под правом `catalog.manage` — проверяет его сервер
 * api, а не эти функции: спрятанная кнопка не защита, и решение о доступе
 * должно приниматься в одном месте.
 */

/**
 * Добавить материал на полку.
 *
 * Заголовок необязателен для человека: в анкете он отвечает на вопрос, а не
 * придумывает название. Если поле пустое, берём название полки — так материал
 * всё равно можно отличить в списке, и лишнее поле не мешает отвечать.
 */
export async function addKbDocument(
  _prev: KbFormState,
  formData: FormData,
): Promise<KbFormState> {
  const slug = String(formData.get("slug") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const fallbackTitle = String(formData.get("fallbackTitle") ?? "").trim();

  if (!slug) return { status: "error", message: "Не указана полка." };
  if (!body) return { status: "error", message: "Напишите ответ — пустое сохранять нечего." };

  const res = await adminMutate("POST", `/v1/admin/knowledge/${encodeURIComponent(slug)}/documents`, {
    title: title || fallbackTitle || "Без названия",
    body,
  });
  if (!res.ok) return { status: "error", message: `Не удалось сохранить: ${res.error}` };

  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${slug}`);
  return { status: "ok", message: "Сохранено." };
}

/**
 * Удаление без корзины: восстановить знание дешевле пересказом, чем механикой
 * отмены, которую пришлось бы объяснять в интерфейсе.
 *
 * ⚠️ Правки материала в этом заходе нет намеренно: у api есть PATCH, но кнопки
 * в интерфейсе нет. Ответы короткие, «удалить и написать заново» покрывает
 * потребность, а форма редактирования в анкете отвлекала бы от главного —
 * дойти до конца вопросов.
 */
export async function deleteKbDocument(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!id) throw new Error("Не указан материал.");

  const res = await adminMutate("DELETE", `/v1/admin/knowledge/documents/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Не удалось удалить: ${res.error}`);

  revalidatePath("/knowledge");
  if (slug) revalidatePath(`/knowledge/${slug}`);
}
