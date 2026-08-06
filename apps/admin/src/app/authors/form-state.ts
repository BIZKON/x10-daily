/**
 * Состояние формы автора.
 *
 * ⚠️ Отдельный модуль намеренно: файл с `"use server"` может экспортировать
 * ТОЛЬКО async-функции, а константа-объект ломает сборку («A "use server" file
 * can only export async functions, found object»).
 *
 * 🔴 Зачем состояние вообще. Раньше экшены молчали на успехе и бросали на
 * ошибке: кнопка «Сохранить изменения» отрабатывала за ~20 мс, страница
 * перерисовывалась теми же значениями, и понять, сохранилось ли, было нельзя —
 * владелец нажал её четыре раза подряд (api отдал четыре 200), решив, что она
 * не работает.
 */
export type AuthorFormState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; message: string };

export const AUTHOR_FORM_IDLE: AuthorFormState = { status: "idle" };
