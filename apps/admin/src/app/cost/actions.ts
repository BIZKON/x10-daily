"use server";

import { adminMutate } from "@/lib/api";
import { redirect } from "next/navigation";
import type { TopupFormState } from "./form-state";

/**
 * Пополнение баланса (Спека 6, шаг 3).
 *
 * Успех здесь — это не сообщение, а уход на страницу оплаты ЮKassa: `redirect`
 * бросает исключение, поэтому возвращаемое состояние описывает только отказы.
 *
 * ⚠️ Сумму и права проверяет api, а не эта функция: решение о деньгах
 * принимается в одном месте, а спрятанная кнопка защитой не является.
 */
export async function startTopup(_prev: TopupFormState, form: FormData): Promise<TopupFormState> {
  const amountRub = Number(String(form.get("amountRub") ?? "").replace(/\s/g, ""));
  const payerEmail = String(form.get("payerEmail") ?? "").trim();

  if (!Number.isFinite(amountRub) || amountRub <= 0) {
    return { status: "error", message: "Укажите сумму пополнения." };
  }
  if (!payerEmail.includes("@")) {
    // Без почты касса не выбьет чек — 54-ФЗ. Отказ здесь честнее, чем платёж
    // без чека, который всплывёт при проверке.
    return { status: "error", message: "Нужна почта для чека." };
  }

  const res = await adminMutate<{ paymentId: string; confirmationUrl: string }>(
    "POST",
    "/v1/admin/billing/topup",
    { amountRub, payerEmail },
  );

  if (!res.ok || !res.data) {
    return { status: "error", message: res.ok ? "Пустой ответ api." : res.error };
  }

  redirect(res.data.confirmationUrl);
}

/**
 * Перепроверяет платёж после возврата с оплаты.
 *
 * Вебхук приходит за секунды, но иногда позже — а человек уже смотрит на свой
 * баланс. Зачисляет та же функция, что и вебхук, поэтому деньги не встанут
 * дважды.
 */
export async function refreshPayment(paymentId: string): Promise<{ state: string } | null> {
  const res = await adminMutate<{ state: string }>(
    "POST",
    `/v1/admin/billing/payments/${encodeURIComponent(paymentId)}/refresh`,
  );
  return res.ok ? (res.data ?? null) : null;
}
