/**
 * Состояния форм партнёрского раздела.
 *
 * 🔴 Отдельный модуль: файл с `"use server"` может экспортировать ТОЛЬКО
 * асинхронные функции. Константа рядом с действием роняет сборку, и ловит это
 * лишь `next build`.
 */
export type PartnerFormState = { status: "idle" | "ok" | "error"; message: string };

export const PARTNER_FORM_IDLE: PartnerFormState = { status: "idle", message: "" };
