"use server";

/**
 * Server action: проксирует upload в /v1/admin/upload с X-User-Id header.
 *
 * Зачем proxy? Client component не имеет доступа к `process.env.X10_ADMIN_USER_ID`
 * (он серверный). Делать NEXT_PUBLIC_ нельзя — header утечёт в браузер.
 *
 * Action принимает FormData с полем "file", возвращает {url} | {error}.
 */

export type UploadResult = { ok: true; url: string } | { ok: false; error: string };

export async function uploadImage(form: FormData): Promise<UploadResult> {
  const base = process.env.X10_API_BASE_URL?.trim();
  const userId = process.env.X10_ADMIN_USER_ID?.trim();
  if (!base) return { ok: false, error: "X10_API_BASE_URL не задан" };
  if (!userId) return { ok: false, error: "X10_ADMIN_USER_ID не задан" };

  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Файл не выбран" };

  // Пересобираем FormData чтобы только нужное поле уходило в API.
  const outgoing = new FormData();
  outgoing.set("file", file);

  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/v1/admin/upload`, {
      method: "POST",
      headers: { "X-User-Id": userId },
      body: outgoing,
    });
    const data = (await res.json()) as { url?: string; error?: string; message?: string };
    if (!res.ok) {
      return { ok: false, error: data.error ?? data.message ?? `HTTP ${res.status}` };
    }
    if (!data.url) return { ok: false, error: "API не вернул url" };
    return { ok: true, url: data.url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}
