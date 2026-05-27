"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminMutate, type AdminEvent } from "@/lib/api";

/**
 * <input type="datetime-local"> возвращает "YYYY-MM-DDTHH:mm" без секунд и таймзоны.
 * Конвертируем в полный ISO для API (.datetime() Zod схема требует Z или ±HH:mm).
 */
function localDatetimeToIso(v: string): string {
  if (!v) return "";
  // Простой парс — браузер уже валидировал. Считаем что это локальное время,
  // конвертируем в ISO с указанием локального offset через Date.
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toISOString();
}

function parseJsonOrNull<T = unknown>(s: string): T | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`Невалидный JSON в поле venue: ${trimmed.slice(0, 60)}`);
  }
}

function parseSpeakerIds(s: string): string[] {
  return s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseEventForm(form: FormData) {
  const slug = String(form.get("slug") ?? "").trim();
  const title = String(form.get("title") ?? "").trim();
  const type = String(form.get("type") ?? "").trim() as AdminEvent["type"];
  const startDateLocal = String(form.get("startDate") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const organizer = String(form.get("organizer") ?? "").trim();

  if (!slug || !title || !type || !startDateLocal || !description || !organizer) {
    throw new Error("slug, title, type, startDate, organizer, description обязательны");
  }

  const startDate = localDatetimeToIso(startDateLocal);
  const endDateLocal = String(form.get("endDate") ?? "").trim();
  const endDate = endDateLocal ? localDatetimeToIso(endDateLocal) : null;

  const priceRaw = String(form.get("ticketPriceFrom") ?? "").trim();
  const capacityRaw = String(form.get("capacity") ?? "").trim();

  return {
    slug,
    title,
    type,
    startDate,
    endDate,
    timezone: String(form.get("timezone") ?? "Europe/Moscow").trim() || "Europe/Moscow",
    city: String(form.get("city") ?? "").trim() || null,
    venue: parseJsonOrNull<{ name: string; address: string; lat?: number; lng?: number }>(
      String(form.get("venue") ?? ""),
    ),
    isOnline: form.get("isOnline") === "on",
    organizer,
    ticketPriceFrom: priceRaw ? Number(priceRaw) : null,
    ticketUrl: String(form.get("ticketUrl") ?? "").trim() || null,
    speakerIds: parseSpeakerIds(String(form.get("speakerIds") ?? "")),
    description,
    coverImageUrl: String(form.get("coverImageUrl") ?? "").trim() || null,
    capacity: capacityRaw ? Number(capacityRaw) : null,
  };
}

export async function createEvent(form: FormData) {
  const body = parseEventForm(form);
  const res = await adminMutate<AdminEvent>("POST", "/v1/admin/events", body);
  if (!res.ok) throw new Error(`Не удалось создать: ${res.error}`);
  revalidatePath("/events");
  redirect(`/events/${res.data.slug}`);
}

export async function updateEvent(id: string, prevSlug: string, form: FormData) {
  const body = parseEventForm(form);
  const res = await adminMutate<AdminEvent>("PATCH", `/v1/admin/events/${id}`, body);
  if (!res.ok) throw new Error(`Не удалось сохранить: ${res.error}`);
  revalidatePath("/events");
  revalidatePath(`/events/${prevSlug}`);
  if (res.data.slug !== prevSlug) {
    revalidatePath(`/events/${res.data.slug}`);
    redirect(`/events/${res.data.slug}`);
  }
}

export async function deleteEvent(id: string) {
  const res = await adminMutate("DELETE", `/v1/admin/events/${id}`);
  if (!res.ok) throw new Error(`Не удалось удалить: ${res.error}`);
  revalidatePath("/events");
  redirect("/events");
}
