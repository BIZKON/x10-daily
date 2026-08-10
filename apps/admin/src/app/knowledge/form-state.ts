/**
 * Состояние форм базы знаний.
 *
 * 🔴 Отдельный модуль, а не соседняя строка в `actions.ts`: файл с директивой
 * `"use server"` может экспортировать ТОЛЬКО асинхронные функции. Константа
 * рядом с действиями роняет сборку — «a use server file can only export async
 * functions, found object». Ровно тот же приём уже применён в `link-form-state.ts`.
 */
export type KbFormState = { status: "idle" | "ok" | "error"; message: string };

export const KB_FORM_IDLE: KbFormState = { status: "idle", message: "" };
