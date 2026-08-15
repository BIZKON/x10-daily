"use server";

import { adminMutate } from "@/lib/api";
import { revalidatePath } from "next/cache";
import type { PartnerFormState } from "./form-state";

/**
 * Партнёрская программа: сделки, платежи, выплаты (спека 14.08).
 *
 * Права проверяет сервер api (`partners.manage`), а не эти функции: спрятанная
 * кнопка не защита, и решение о доступе принимается в одном месте.
 */

const num = (form: FormData, key: string): number =>
  Number(String(form.get(key) ?? "").replace(",", "."));

/** Заводит сделку. Ставка копируется в неё на сервере. */
export async function createDeal(
  _prev: PartnerFormState,
  form: FormData,
): Promise<PartnerFormState> {
  const partnerId = String(form.get("partnerId") ?? "").trim();
  const clientName = String(form.get("clientName") ?? "").trim();
  const pkg = String(form.get("package") ?? "line");
  const amountRub = num(form, "amountRub");

  if (!partnerId || clientName.length < 2) {
    return { status: "error", message: "Укажите клиента." };
  }
  if (!Number.isFinite(amountRub) || amountRub <= 0) {
    return { status: "error", message: "Сумма сделки должна быть больше нуля." };
  }

  const res = await adminMutate(
    "POST",
    `/v1/admin/partners/${encodeURIComponent(partnerId)}/deals`,
    {
      clientName,
      clientContact: String(form.get("clientContact") ?? "").trim() || undefined,
      package: pkg,
      amountRub,
      installmentMonths: Number(form.get("installmentMonths") ?? 1) || 1,
      note: String(form.get("note") ?? "").trim() || undefined,
    },
  );
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath(`/partners/${partnerId}`);
  return { status: "ok", message: "Сделка заведена." };
}

/**
 * Записывает поступивший платёж клиента.
 *
 * 🔴 Именно здесь начисляется доля партнёру и наставнику — на сервере, одной
 * транзакцией с платежом. Отметить платёж «потом» нельзя: без него партнёр
 * ничего не получит, а он уже ждёт.
 */
export async function addPayment(
  _prev: PartnerFormState,
  form: FormData,
): Promise<PartnerFormState> {
  const dealId = String(form.get("dealId") ?? "").trim();
  const partnerId = String(form.get("partnerId") ?? "").trim();
  const amountRub = num(form, "amountRub");

  if (!dealId) return { status: "error", message: "Не указана сделка." };
  if (!Number.isFinite(amountRub) || amountRub <= 0) {
    return { status: "error", message: "Сумма платежа должна быть больше нуля." };
  }

  const res = await adminMutate<{ accruals: Array<{ amountRub: number; reason: string }> }>(
    "POST",
    `/v1/admin/deals/${encodeURIComponent(dealId)}/payments`,
    { amountRub, note: String(form.get("note") ?? "").trim() || undefined },
  );
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath(`/partners/${partnerId}`);
  revalidatePath("/partners");

  const total = res.data?.accruals?.reduce((s, a) => s + a.amountRub, 0) ?? 0;
  const mentor = res.data?.accruals?.some((a) => a.reason === "mentor");
  return {
    status: "ok",
    message: `Платёж записан, начислено ${Math.round(total).toLocaleString("ru-RU")} ₽${mentor ? " (включая долю наставника)" : ""}.`,
  };
}

/** Отмечает выплату партнёру. Перевод делает человек — здесь только след. */
export async function addPayout(
  _prev: PartnerFormState,
  form: FormData,
): Promise<PartnerFormState> {
  const partnerId = String(form.get("partnerId") ?? "").trim();
  const amountRub = num(form, "amountRub");
  if (!partnerId) return { status: "error", message: "Не указан партнёр." };
  if (!Number.isFinite(amountRub) || amountRub <= 0) {
    return { status: "error", message: "Сумма выплаты должна быть больше нуля." };
  }

  const res = await adminMutate(
    "POST",
    `/v1/admin/partners/${encodeURIComponent(partnerId)}/payouts`,
    {
      amountRub,
      method: String(form.get("method") ?? "").trim() || undefined,
      note: String(form.get("note") ?? "").trim() || undefined,
    },
  );
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath(`/partners/${partnerId}`);
  revalidatePath("/partners");
  return { status: "ok", message: "Выплата отмечена." };
}

/** Меняет наставника. Цикл в дереве отбивает сервер. */
export async function setMentor(form: FormData) {
  const partnerId = String(form.get("partnerId") ?? "").trim();
  const parentId = String(form.get("parentId") ?? "").trim();
  if (!partnerId) throw new Error("Не указан партнёр.");

  const res = await adminMutate(
    "PATCH",
    `/v1/admin/partners/${encodeURIComponent(partnerId)}/mentor`,
    { parentId: parentId || null },
  );
  if (!res.ok) throw new Error(`Не удалось сохранить наставника: ${res.error}`);

  revalidatePath(`/partners/${partnerId}`);
}

/**
 * Правка карточки партнёра: его страница КП, имя, контакт, ставка, участие.
 *
 * 🔴 Слаг связывает человека с документом, который уже разослан клиентам.
 * Занятый адрес сервер отбивает: чужая страница в руках партнёра хуже, чем её
 * отсутствие.
 */
export async function updatePartner(
  _prev: PartnerFormState,
  form: FormData,
): Promise<PartnerFormState> {
  const partnerId = String(form.get("partnerId") ?? "").trim();
  if (!partnerId) return { status: "error", message: "Не указан партнёр." };

  const rate = String(form.get("ratePercent") ?? "").trim();
  const res = await adminMutate("PATCH", `/v1/admin/partners/${encodeURIComponent(partnerId)}`, {
    slug: String(form.get("slug") ?? "").trim(),
    name: String(form.get("name") ?? "").trim() || undefined,
    contact: String(form.get("contact") ?? "").trim(),
    ratePercent: rate ? Number(rate.replace(",", ".")) : undefined,
    status: String(form.get("status") ?? "") || undefined,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath(`/partners/${partnerId}`);
  revalidatePath("/partners");
  return { status: "ok", message: "Сохранено." };
}
