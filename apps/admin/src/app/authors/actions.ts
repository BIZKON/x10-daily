"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminMutate, type AdminAuthor } from "@/lib/api";

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

export async function createAuthor(form: FormData) {
  const body = parseAuthorForm(form);
  const res = await adminMutate<AdminAuthor>("POST", "/v1/admin/authors", body);
  if (!res.ok) throw new Error(`Не удалось создать: ${res.error}`);
  revalidatePath("/authors");
  redirect(`/authors/${res.data.slug}`);
}

export async function updateAuthor(id: string, prevSlug: string, form: FormData) {
  const body = parseAuthorForm(form);
  const res = await adminMutate<AdminAuthor>("PATCH", `/v1/admin/authors/${id}`, body);
  if (!res.ok) throw new Error(`Не удалось сохранить: ${res.error}`);
  revalidatePath("/authors");
  revalidatePath(`/authors/${prevSlug}`);
  if (res.data.slug !== prevSlug) {
    revalidatePath(`/authors/${res.data.slug}`);
    redirect(`/authors/${res.data.slug}`);
  }
}

export async function deleteAuthor(id: string) {
  const res = await adminMutate("DELETE", `/v1/admin/authors/${id}`);
  if (!res.ok) throw new Error(`Не удалось удалить: ${res.error}`);
  revalidatePath("/authors");
  redirect("/authors");
}
