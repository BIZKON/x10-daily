"use server";

import { postPay } from "@/lib/api";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PayFormState } from "./form-state";

/**
 * Действия клиента на странице оплаты (спека 7).
 *
 * ⚠️ Права здесь не проверяются и проверяться не могут: страница публичная,
 * знание кода ссылки и есть доступ. Всё остальное решает api.
 */

const errorFrom = (data: unknown, fallback: string): string => {
  const j = data as { message?: string; error?: string } | null;
  return j?.message ?? j?.error ?? fallback;
};

/** Оплата картой: уводит на страницу ЮKassa. */
export async function startCardPayment(_prev: PayFormState, form: FormData): Promise<PayFormState> {
  const token = String(form.get("token") ?? "");
  const payerEmail = String(form.get("payerEmail") ?? "").trim();

  if (!payerEmail.includes("@")) {
    return { status: "error", message: "Нужна почта — на неё придёт чек." };
  }
  if (form.get("offerAccepted") !== "on") {
    return { status: "error", message: "Отметьте согласие с офертой." };
  }

  const res = await postPay(token, "start", { payerEmail, offerAccepted: true });
  if (!res.ok) {
    return { status: "error", message: errorFrom(res.data, "Не удалось открыть оплату.") };
  }

  const url = (res.data as { confirmationUrl?: string } | null)?.confirmationUrl;
  if (!url) return { status: "error", message: "Оплата не открылась. Попробуйте ещё раз." };

  redirect(url);
}

/** Реквизиты юрлица для счёта. Остаёмся на странице — счёт рядом. */
export async function saveCompany(_prev: PayFormState, form: FormData): Promise<PayFormState> {
  const token = String(form.get("token") ?? "");
  const payerName = String(form.get("payerName") ?? "").trim();
  const payerInn = String(form.get("payerInn") ?? "").replace(/\D/g, "");

  if (payerName.length < 2) return { status: "error", message: "Укажите название организации." };
  if (payerInn.length !== 10 && payerInn.length !== 12) {
    return { status: "error", message: "ИНН — 10 цифр у организации, 12 у ИП." };
  }

  const res = await postPay(token, "company", {
    payerName,
    payerInn,
    payerKpp: String(form.get("payerKpp") ?? "").replace(/\D/g, "") || undefined,
    payerAddress: String(form.get("payerAddress") ?? "").trim() || undefined,
  });

  if (!res.ok) {
    return { status: "error", message: errorFrom(res.data, "Не удалось сохранить реквизиты.") };
  }

  revalidatePath(`/pay/${token}`);
  // Ссылка на документ, а не «сохранено»: клиент вводил реквизиты ради счёта.
  return { status: "invoice", message: "", invoiceUrl: `/pay/${token}/invoice` };
}
