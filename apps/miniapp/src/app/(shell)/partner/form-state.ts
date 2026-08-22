/**
 * Состояние формы регистрации в программе.
 *
 * 🔴 Отдельный модуль: файл с директивой `"use server"` может экспортировать
 * ТОЛЬКО асинхронные функции. Константа рядом с действием роняет сборку, и
 * ловит это лишь `next build`.
 */
export type JoinState = { status: "idle" | "error"; message: string };

export const JOIN_IDLE: JoinState = { status: "idle", message: "" };

/**
 * Заказ заведён: ссылка на оплату и что сказать клиенту.
 *
 * Успех здесь — не сообщение, а ссылка: партнёр отдаёт её прямо из этого
 * состояния, не перезагружая экран и не ища заказ в списке.
 */
export type OrderState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "created"; payUrl: string; dealNo: number; firstPaymentRub: number };

export const ORDER_IDLE: OrderState = { status: "idle" };

/**
 * Налоговый статус: спрашиваем при первом начислении, а не при регистрации.
 */
export type TaxState = { status: "idle" | "ok" | "error"; message: string };

export const TAX_IDLE: TaxState = { status: "idle", message: "" };
