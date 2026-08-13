/**
 * Состояние форм экрана «Постинг».
 *
 * 🔴 Отдельный модуль, а не соседняя строка в `actions.ts`: файл с директивой
 * `"use server"` может экспортировать ТОЛЬКО асинхронные функции. Константа
 * рядом с действиями роняет сборку, и ловит это лишь `next build`.
 */
export type PostingFormState = { status: "idle" | "ok" | "error"; message: string };

export const POSTING_FORM_IDLE: PostingFormState = { status: "idle", message: "" };

/** Минимум причины снятия. Держим в согласии с api (`MIN_REJECT_REASON`). */
export const MIN_REJECT_REASON = 3;
