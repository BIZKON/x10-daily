"use server";

import { adminMutate } from "@/lib/api";
import { revalidatePath } from "next/cache";
import type { CreateFormState } from "./form-state";

/**
 * Поставить задание в очередь.
 *
 * Работа идёт в конвейере: сбор знаний по полкам режима, обращение к модели,
 * запись результата. Здесь только передача темы и человеческий ответ на отказ.
 */

/**
 * Коды отказа переводим здесь, а не показываем как есть.
 *
 * `adminMutate` отдаёт машинный `error` вперёд человеческого `message`, и без
 * этой таблицы клиент увидел бы «mode_unavailable». Менять общий клиент ради
 * одного экрана рискованнее: на его нынешнее поведение опираются соседи.
 */
const REASONS: Record<string, string> = {
  mode_unavailable: "Этот режим ещё готовится — материал по нему пока не создаётся.",
  not_found: "Такого режима нет. Обновите страницу.",
  queue_failed: "Не удалось поставить задание в очередь. Попробуйте ещё раз.",
  forbidden: "Недостаточно прав: создавать материалы может редактор или автор.",
};

export async function createMaterial(
  _prev: CreateFormState,
  form: FormData,
): Promise<CreateFormState> {
  const modeSlug = String(form.get("modeSlug") ?? "").trim();
  const prompt = String(form.get("prompt") ?? "").trim();

  if (!modeSlug) return { status: "error", message: "Выберите, что создаём." };
  if (!prompt) return { status: "error", message: "Скажите, о чём материал." };

  const res = await adminMutate<{ id: string }>("POST", "/v1/admin/create", { modeSlug, prompt });

  if (!res.ok) {
    const known = res.error ? REASONS[res.error] : undefined;
    return {
      status: "error",
      message: known ?? "Не удалось создать материал. Попробуйте ещё раз.",
    };
  }

  revalidatePath("/create");
  return {
    status: "ok",
    message: "Задание принято. Материал появится в списке ниже через минуту.",
  };
}
