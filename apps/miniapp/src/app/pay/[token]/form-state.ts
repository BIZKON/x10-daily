/**
 * Состояния форм страницы оплаты.
 *
 * 🔴 Отдельный модуль: файл с `"use server"` экспортирует только асинхронные
 * функции, и константа рядом с действием роняет сборку — ловит это `next build`.
 */
export type PayFormState =
  | { status: "idle" | "error"; message: string }
  /** Реквизиты приняты — клиенту нужен сам счёт, а не сообщение «сохранено». */
  | { status: "invoice"; message: string; invoiceUrl: string };

export const PAY_FORM_IDLE: PayFormState = { status: "idle", message: "" };
