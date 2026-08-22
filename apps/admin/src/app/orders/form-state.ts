/**
 * Состояния форм раздела «Заказы».
 *
 * 🔴 Отдельный модуль: файл с `"use server"` может экспортировать ТОЛЬКО
 * асинхронные функции. Константа рядом с действием роняет сборку, и ловит это
 * лишь `next build`.
 */
export type OrderFormState = { status: "idle" | "ok" | "error"; message: string };

export const ORDER_FORM_IDLE: OrderFormState = { status: "idle", message: "" };

/**
 * Заказ заведён: успех здесь — не сообщение, а ссылка на оплату. Владелец
 * отдаёт её клиенту прямо отсюда, не разыскивая заказ в списке.
 */
export type NewOrderState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "created"; payUrl: string; dealNo: number };

export const NEW_ORDER_IDLE: NewOrderState = { status: "idle" };
