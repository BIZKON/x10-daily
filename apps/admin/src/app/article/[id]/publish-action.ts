"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { publishArticle } from "@/lib/api";

export async function publishAction(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) {
    return;
  }
  const result = await publishArticle(id);
  if (result.ok) {
    revalidatePath("/");
    redirect("/?published=" + encodeURIComponent(id));
  }
  // Если ошибка — редиректим на статью с error-параметром (страница покажет alert).
  redirect(
    `/article/${encodeURIComponent(id)}?error=` +
      encodeURIComponent(result.error ?? "publish_failed"),
  );
}
