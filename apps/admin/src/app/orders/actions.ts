"use server";

import { adminMutate } from "@/lib/api";
import { revalidatePath } from "next/cache";
import type { NewOrderState, OrderFormState } from "./form-state";

/**
 * Заказы: заведение, поступившая оплата, возврат (спека 7).
 *
 * Права проверяет api (`partners.manage`), а не эти функции: спрятанная кнопка
 * не защита, и решение о доступе принимается в одном месте.
 */

const num = (form: FormData, key: string): number =>
  Number(String(form.get(key) ?? "").replace(",", "."));

/**
 * Заводит заказ. Партнёр необязателен: владелец продаёт и сам.
 *
 * 🔴 Сумму владелец задаёт любую — это то же правило, что «скидка по
 * согласованию». Партнёру такого не дано: у него только прайс.
 */
export async function createOrder(_prev: NewOrderState, form: FormData): Promise<NewOrderState> {
  const clientName = String(form.get("clientName") ?? "").trim();
  const amountRub = num(form, "amountRub");
  const partnerId = String(form.get("partnerId") ?? "").trim();

  if (clientName.length < 2) return { status: "error", message: "Укажите клиента." };
  if (!Number.isFinite(amountRub) || amountRub <= 0) {
    return { status: "error", message: "Сумма заказа должна быть больше нуля." };
  }

  const res = await adminMutate<{ payUrl: string; dealNo: number }>("POST", "/v1/admin/orders", {
    clientName,
    clientContact: String(form.get("clientContact") ?? "").trim() || undefined,
    package: String(form.get("package") ?? "line"),
    amountRub,
    installmentMonths: Number(form.get("installmentMonths") ?? 1) || 1,
    partnerId: partnerId || null,
    note: String(form.get("note") ?? "").trim() || undefined,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/orders");
  revalidatePath("/partners");
  return { status: "created", payUrl: res.data.payUrl, dealNo: res.data.dealNo };
}

/**
 * Отмечает поступивший платёж.
 *
 * 🔴 Здесь же начисляется доля партнёру — на сервере, одной транзакцией с
 * платежом. Оплату картой по ссылке система записывает сама: отметить её
 * повторно значит начислить дважды.
 */
export async function addOrderPayment(
  _prev: OrderFormState,
  form: FormData,
): Promise<OrderFormState> {
  const dealId = String(form.get("dealId") ?? "").trim();
  const amountRub = num(form, "amountRub");

  if (!dealId) return { status: "error", message: "Не указан заказ." };
  if (!Number.isFinite(amountRub) || amountRub <= 0) {
    return { status: "error", message: "Сумма платежа должна быть больше нуля." };
  }

  const res = await adminMutate("POST", `/v1/admin/deals/${encodeURIComponent(dealId)}/payments`, {
    amountRub,
    note: String(form.get("note") ?? "").trim() || undefined,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/orders");
  revalidatePath("/partners");
  return { status: "ok", message: "Платёж записан, доля начислена." };
}

/** Возврат клиенту: отрицательный платёж и сторно комиссии одной транзакцией. */
export async function refundOrder(_prev: OrderFormState, form: FormData): Promise<OrderFormState> {
  const dealId = String(form.get("dealId") ?? "").trim();
  const amountRub = num(form, "amountRub");

  if (!dealId) return { status: "error", message: "Не указан заказ." };
  if (!Number.isFinite(amountRub) || amountRub <= 0) {
    return { status: "error", message: "Сумма возврата должна быть больше нуля." };
  }

  const res = await adminMutate<{ reversed: Array<{ amountRub: number }> }>(
    "POST",
    `/v1/admin/deals/${encodeURIComponent(dealId)}/refunds`,
    { amountRub, note: String(form.get("note") ?? "").trim() || undefined },
  );
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/orders");
  revalidatePath("/partners");

  const back = res.data.reversed.reduce((sum, r) => sum + Math.abs(r.amountRub), 0);
  return {
    status: "ok",
    message: back > 0 ? `Возврат записан, комиссия сторнирована на ${back} ₽.` : "Возврат записан.",
  };
}
