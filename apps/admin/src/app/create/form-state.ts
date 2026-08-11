/**
 * Состояние формы создания материала.
 *
 * 🔴 Отдельным файлом, а не рядом с action: файл с "use server" обязан
 * экспортировать ТОЛЬКО функции — объект в нём ломает сборку. `tsc` этого не
 * видит, ловит только `next build`, поэтому правило легко нарушить и узнать об
 * этом на деплое (наступали дважды: форма автора, форма ссылки).
 */
export type CreateFormState =
  | { status: "idle" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string };

export const CREATE_FORM_IDLE: CreateFormState = { status: "idle" };
