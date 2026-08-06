"use server";

import { adminMutate } from "@/lib/api";
import type { TeamRole } from "@x10/config";
import { revalidatePath } from "next/cache";

/**
 * Команда клиента (Спека 5). Все действия — только у Владельца; сервер это
 * проверяет сам, интерфейс лишь не показывает лишнего.
 */

/** Сменить роль участника. */
export async function setMemberRole(id: string, role: TeamRole) {
  const res = await adminMutate("PATCH", `/v1/admin/team/${encodeURIComponent(id)}`, { role });
  if (!res.ok) throw new Error(res.error);
  revalidatePath("/team");
}

/** Убрать из команды: человек становится обычным читателем, а не удаляется. */
export async function removeMember(id: string) {
  const res = await adminMutate("DELETE", `/v1/admin/team/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(res.error);
  revalidatePath("/team");
}

/**
 * Создать приглашение. Возвращает ссылку — её видно РОВНО ОДИН РАЗ: в базе
 * лежит только хеш, показать повторно физически нельзя.
 */
export async function createInvite(
  role: TeamRole,
  maxUses: number,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const res = await adminMutate<{ token: string }>("POST", "/v1/admin/team/invites", {
    role,
    maxUses,
  });
  if (!res.ok) return { ok: false, error: res.error };

  const base = process.env.X10_ADMIN_PUBLIC_URL?.trim();
  if (!base) {
    return {
      ok: false,
      error:
        "Не задан адрес кабинета (X10_ADMIN_PUBLIC_URL) — ссылку некуда вести. Приглашение создано, но им не воспользоваться: отзовите его.",
    };
  }

  revalidatePath("/team");
  return { ok: true, url: `${base.replace(/\/+$/, "")}/join?t=${res.data.token}` };
}

export async function revokeInvite(id: string) {
  const res = await adminMutate("DELETE", `/v1/admin/team/invites/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(res.error);
  revalidatePath("/team");
}
