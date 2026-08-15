/**
 * Состояние формы пополнения.
 *
 * 🔴 Отдельный модуль: файл с `"use server"` экспортирует ТОЛЬКО асинхронные
 * функции, и константа рядом с действием роняет сборку — ловит это лишь
 * `next build`.
 */
export type TopupFormState = { status: "idle" | "error"; message: string };

export const TOPUP_FORM_IDLE: TopupFormState = { status: "idle", message: "" };
