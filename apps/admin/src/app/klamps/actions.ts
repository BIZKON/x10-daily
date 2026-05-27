"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminMutate, type AdminKlamp } from "@/lib/api";

function parseKlampForm(form: FormData) {
  const slug = String(form.get("slug") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  const city = String(form.get("city") ?? "").trim();
  const leadName = String(form.get("leadName") ?? "").trim();
  const meetingSchedule = String(form.get("meetingSchedule") ?? "").trim();
  if (!slug || !name || !city || !leadName || !meetingSchedule) {
    throw new Error("slug, name, city, leadName, meetingSchedule обязательны");
  }
  return {
    slug,
    name,
    city,
    country: String(form.get("country") ?? "РФ").trim().slice(0, 4) || "РФ",
    leadName,
    leadContact: String(form.get("leadContact") ?? "").trim() || null,
    memberCount: Number(form.get("memberCount") ?? 0) || 0,
    isOpen: form.get("isOpen") === "on",
    meetingSchedule,
    description: String(form.get("description") ?? "").trim(),
    goal: String(form.get("goal") ?? "").trim() || null,
  };
}

export async function createKlamp(form: FormData) {
  const body = parseKlampForm(form);
  const res = await adminMutate<AdminKlamp>("POST", "/v1/admin/klamps", body);
  if (!res.ok) throw new Error(`Не удалось создать: ${res.error}`);
  revalidatePath("/klamps");
  redirect(`/klamps/${res.data.slug}`);
}

export async function updateKlamp(id: string, prevSlug: string, form: FormData) {
  const body = parseKlampForm(form);
  const res = await adminMutate<AdminKlamp>("PATCH", `/v1/admin/klamps/${id}`, body);
  if (!res.ok) throw new Error(`Не удалось сохранить: ${res.error}`);
  revalidatePath("/klamps");
  revalidatePath(`/klamps/${prevSlug}`);
  if (res.data.slug !== prevSlug) {
    revalidatePath(`/klamps/${res.data.slug}`);
    redirect(`/klamps/${res.data.slug}`);
  }
}

export async function deleteKlamp(id: string) {
  const res = await adminMutate("DELETE", `/v1/admin/klamps/${id}`);
  if (!res.ok) throw new Error(`Не удалось удалить: ${res.error}`);
  revalidatePath("/klamps");
  redirect("/klamps");
}
