/**
 * Состояние формы добавления источника.
 *
 * ⚠️ Отдельный модуль: файл с `"use server"` может экспортировать только
 * async-функции, константа-объект ломает сборку.
 *
 * `checking` — не украшение, а честное состояние: добавленный источник ещё не
 * работает, конвейер сначала читает его фид. Показать «Добавлено» было бы
 * враньём — источник может и не пройти проверку.
 */
export type SourceFormState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "error"; message: string };

export const SOURCE_FORM_IDLE: SourceFormState = { status: "idle" };
