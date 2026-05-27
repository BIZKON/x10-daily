"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminMutate, type AdminDigest } from "@/lib/api";

function parseLines(s: string): string[] {
  return s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseJsonOrNull<T = unknown>(s: string, fieldName: string): T | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`Невалидный JSON в поле ${fieldName}`);
  }
}

function parseDigestForm(form: FormData) {
  const issueDate = String(form.get("issueDate") ?? "").trim();
  const intro = String(form.get("intro") ?? "").trim();
  const topArticleIds = parseLines(String(form.get("topArticleIds") ?? ""));

  if (!issueDate || !intro) throw new Error("issueDate, intro обязательны");
  if (topArticleIds.length === 0) throw new Error("Минимум 1 article ID в topArticleIds");
  if (topArticleIds.length > 10) throw new Error("Максимум 10 article IDs");

  return {
    issueDate,
    intro,
    topArticleIds,
    rybakovTake: parseJsonOrNull<{ quote: string; context: string }>(
      String(form.get("rybakovTake") ?? ""),
      "rybakovTake",
    ),
    premiumTeaser: parseJsonOrNull<{ title: string; articleId: string }>(
      String(form.get("premiumTeaser") ?? ""),
      "premiumTeaser",
    ),
    tomorrow: String(form.get("tomorrow") ?? "").trim() || null,
  };
}

export async function createDigest(form: FormData) {
  const body = parseDigestForm(form);
  const res = await adminMutate<AdminDigest>("POST", "/v1/admin/digests", body);
  if (!res.ok) throw new Error(`Не удалось создать: ${res.error}`);
  revalidatePath("/digests");
  redirect(`/digests/${res.data.issueDate}`);
}

export async function updateDigest(id: string, prevDate: string, form: FormData) {
  const body = parseDigestForm(form);
  const res = await adminMutate<AdminDigest>("PATCH", `/v1/admin/digests/${id}`, body);
  if (!res.ok) throw new Error(`Не удалось сохранить: ${res.error}`);
  revalidatePath("/digests");
  revalidatePath(`/digests/${prevDate}`);
  if (res.data.issueDate !== prevDate) {
    revalidatePath(`/digests/${res.data.issueDate}`);
    redirect(`/digests/${res.data.issueDate}`);
  }
}

export async function deleteDigest(id: string) {
  const res = await adminMutate("DELETE", `/v1/admin/digests/${id}`);
  if (!res.ok) throw new Error(`Не удалось удалить: ${res.error}`);
  revalidatePath("/digests");
  redirect("/digests");
}

export async function markDigestSent(id: string, date: string) {
  const res = await adminMutate("POST", `/v1/admin/digests/${id}/mark-sent`);
  if (!res.ok) throw new Error(`Не удалось пометить отправленным: ${res.error}`);
  revalidatePath("/digests");
  revalidatePath(`/digests/${date}`);
}
