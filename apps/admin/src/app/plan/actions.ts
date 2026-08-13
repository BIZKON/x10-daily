"use server";

import { adminMutate } from "@/lib/api";
import { revalidatePath } from "next/cache";
import type { PlanFormState } from "./form-state";

/**
 * Контент-план: сборка и работа с темой.
 *
 * Права проверяет сервер api (`content.edit`), а не эти функции: спрятанная
 * кнопка не защита, и решение о доступе должно приниматься в одном месте.
 */

/** Собрать план на месяц. Отказы api человеческие — показываем их как есть. */
export async function buildPlan(_prev: PlanFormState, _formData: FormData): Promise<PlanFormState> {
  const res = await adminMutate("POST", "/v1/admin/plan");
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/plan");
  return { status: "ok", message: "Собираем план — это займёт около минуты." };
}

/** Сделать материал из темы: дальше работает обычный путь конвейера. */
export async function makeTopic(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Не указана тема.");

  const res = await adminMutate("POST", `/v1/admin/plan/items/${encodeURIComponent(id)}/make`);
  if (!res.ok) throw new Error(`Не удалось создать материал: ${res.error}`);

  revalidatePath("/plan");
  revalidatePath("/create");
}

/** Перенести тему на другой день или слот. */
export async function moveTopic(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const plannedFor = String(formData.get("plannedFor") ?? "").trim();
  const slotRaw = String(formData.get("slot") ?? "").trim();
  if (!id || !plannedFor) throw new Error("Не указана тема или дата.");

  const res = await adminMutate("PATCH", `/v1/admin/plan/items/${encodeURIComponent(id)}`, {
    plannedFor,
    slot: slotRaw || null,
  });
  if (!res.ok) throw new Error(`Не удалось перенести: ${res.error}`);

  revalidatePath("/plan");
}

/**
 * Убрать тему. Без корзины: непринятая тема ничего не значит, а «корзину
 * убранного» пришлось бы объяснять в интерфейсе.
 */
export async function dropTopic(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Не указана тема.");

  const res = await adminMutate("DELETE", `/v1/admin/plan/items/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Не удалось убрать тему: ${res.error}`);

  revalidatePath("/plan");
}
