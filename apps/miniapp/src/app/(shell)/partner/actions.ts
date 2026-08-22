"use server";

import { createPartnerOrder, joinPartnerProgram, savePartnerTax } from "@/lib/api";
import { revalidatePath } from "next/cache";
import type { JoinState, OrderState, TaxState } from "./form-state";

/**
 * Регистрация в партнёрской программе — один тап.
 *
 * Человек уже вошёл через Telegram, имя и контакт берутся из профиля: анкета
 * на этом шаге отсеяла бы часть людей ровно в момент интереса. Реквизиты для
 * выплаты спросим, когда появится первое начисление.
 */
export async function joinProgram(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const ref = String(formData.get("ref") ?? "").trim();
  const error = await joinPartnerProgram(ref || undefined);
  if (error) return { status: "error", message: error };

  revalidatePath("/partner");
  revalidatePath("/profile");
  return { status: "idle", message: "" };
}

/**
 * Заводит клиента на оплату (спека 7).
 *
 * Партнёр выбирает пакет, а не сумму: цену ставит прайс. Скидка — отдельный
 * разговор с владельцем, и это правило живёт на сервере, а не в этой форме.
 */
export async function createOrder(_prev: OrderState, form: FormData): Promise<OrderState> {
  const clientName = String(form.get("clientName") ?? "").trim();
  const pkg = String(form.get("package") ?? "line") === "manual" ? "manual" : "line";
  const installments = String(form.get("installments") ?? "1") === "2" ? 2 : 1;

  if (clientName.length < 2) {
    return { status: "error", message: "Напишите, кто клиент — это увидите только вы и мы." };
  }

  const res = await createPartnerOrder({
    clientName,
    clientContact: String(form.get("clientContact") ?? "").trim() || undefined,
    package: pkg,
    installments,
  });

  if ("error" in res) return { status: "error", message: res.error };

  revalidatePath("/partner");
  return {
    status: "created",
    payUrl: res.payUrl,
    dealNo: res.dealNo,
    firstPaymentRub: res.firstPaymentRub,
  };
}

/**
 * Налоговый статус партнёра.
 *
 * 🔴 Спрашиваем здесь, а не при регистрации: вступление остаётся в один тап.
 * Но пока статус неизвестен, мы не знаем, удерживать ли НДФЛ, — и человек
 * видит в кабинете сумму, которая может не совпасть с переводом.
 */
export async function saveTaxStatus(_prev: TaxState, form: FormData): Promise<TaxState> {
  const taxStatus = String(form.get("taxStatus") ?? "").trim();
  const inn = String(form.get("inn") ?? "").trim();

  if (!taxStatus) return { status: "error", message: "Выберите статус." };
  if (inn && !/^\d{10,12}$/.test(inn)) {
    return { status: "error", message: "ИНН — это 10 или 12 цифр." };
  }

  const error = await savePartnerTax({ taxStatus, inn: inn || undefined });
  if (error) return { status: "error", message: error };

  revalidatePath("/partner");
  return { status: "ok", message: "Спасибо, записали." };
}
