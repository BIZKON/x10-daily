/**
 * Состояние формы регистрации в программе.
 *
 * 🔴 Отдельный модуль: файл с директивой `"use server"` может экспортировать
 * ТОЛЬКО асинхронные функции. Константа рядом с действием роняет сборку, и
 * ловит это лишь `next build`.
 */
export type JoinState = { status: "idle" | "error"; message: string };

export const JOIN_IDLE: JoinState = { status: "idle", message: "" };
