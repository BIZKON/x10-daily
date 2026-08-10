/**
 * Состояние формы разбора по ссылке.
 *
 * Отдельным файлом, а не рядом с action: файл с "use server" обязан
 * экспортировать только функции — объект в нём ломает сборку (наступали
 * на это с формой автора).
 */
export type LinkFormState =
  | { status: "idle" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string };

export const LINK_FORM_IDLE: LinkFormState = { status: "idle" };
