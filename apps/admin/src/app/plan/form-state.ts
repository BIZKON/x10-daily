/**
 * Состояние форм контент-плана.
 *
 * 🔴 Отдельный модуль, а не соседняя строка в `actions.ts`: файл с директивой
 * `"use server"` может экспортировать ТОЛЬКО асинхронные функции. Константа
 * рядом с действиями роняет сборку, и ловит это лишь `next build`.
 */
export type PlanFormState = { status: "idle" | "ok" | "error"; message: string };

export const PLAN_FORM_IDLE: PlanFormState = { status: "idle", message: "" };
