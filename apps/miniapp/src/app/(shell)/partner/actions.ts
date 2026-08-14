"use server";

import { joinPartnerProgram } from "@/lib/api";
import { revalidatePath } from "next/cache";
import type { JoinState } from "./form-state";

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
