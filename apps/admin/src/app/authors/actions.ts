"use server";

import { type AdminAuthor, adminMutate } from "@/lib/api";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AuthorFormState } from "./form-state";

function parseAuthorForm(form: FormData) {
  const slug = String(form.get("slug") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  const role = String(form.get("role") ?? "").trim();
  if (!slug || !name || !role) throw new Error("slug, name, role обязательны");
  return {
    slug,
    name,
    role,
    bio: String(form.get("bio") ?? "").trim(),
    avatarUrl: String(form.get("avatarUrl") ?? "").trim() || null,
    bylineColor: String(form.get("bylineColor") ?? "").trim() || null,
    isStaff: form.get("isStaff") === "on",
    isFlagship: form.get("isFlagship") === "on",
  };
}

export async function createAuthor(
  _prev: AuthorFormState,
  form: FormData,
): Promise<AuthorFormState> {
  let created: AdminAuthor;
  try {
    const body = parseAuthorForm(form);
    const res = await adminMutate<AdminAuthor>("POST", "/v1/admin/authors", body);
    if (!res.ok) return { status: "error", message: `Не удалось создать: ${res.error}` };
    created = res.data;
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Не удалось создать" };
  }
  revalidatePath("/authors");
  // ⚠️ redirect бросает служебное исключение и обязан быть ВНЕ try/catch:
  // внутри его поймал бы catch и показал переход как ошибку формы.
  redirect(`/authors/${created.slug}`);
}

export async function updateAuthor(
  id: string,
  prevSlug: string,
  _prev: AuthorFormState,
  form: FormData,
): Promise<AuthorFormState> {
  let saved: AdminAuthor;
  try {
    const body = parseAuthorForm(form);
    const res = await adminMutate<AdminAuthor>("PATCH", `/v1/admin/authors/${id}`, body);
    if (!res.ok) return { status: "error", message: `Не удалось сохранить: ${res.error}` };
    saved = res.data;
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Не удалось сохранить" };
  }

  revalidatePath("/authors");
  revalidatePath(`/authors/${prevSlug}`);
  if (saved.slug !== prevSlug) {
    revalidatePath(`/authors/${saved.slug}`);
    redirect(`/authors/${saved.slug}`);
  }
  return { status: "saved" };
}

export async function deleteAuthor(id: string) {
  const res = await adminMutate("DELETE", `/v1/admin/authors/${id}`);
  if (!res.ok) throw new Error(`Не удалось удалить: ${res.error}`);
  revalidatePath("/authors");
  redirect("/authors");
}
