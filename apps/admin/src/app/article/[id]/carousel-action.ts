"use server";

import { adminMutate } from "@/lib/api";
import { revalidatePath } from "next/cache";

/**
 * «Сделать карусель» — просит конвейер разобрать материал на слайды.
 *
 * 🔴 Ручное действие, а не автомат на каждую статью: это платный прогон модели
 * на материал, который может никуда не пойти. Когда форматы станут настройкой
 * экземпляра (реестр §3.10), здесь появится и автотриггер по флагу.
 *
 * Слайды не публикуются сами: конвейер доводит их до «ждут решения», а в канал
 * альбом пускает редактор на экране «Обложки и карусели».
 */
export async function makeCarouselAction(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "").trim();
  if (!id) return;
  await adminMutate("POST", `/v1/admin/carousels/${encodeURIComponent(id)}/make`);
  revalidatePath(`/article/${id}`);
  revalidatePath("/visuals");
}
