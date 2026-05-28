"use server";

/**
 * Server Actions для article engagement.
 *
 * Тонкий слой над postReaction/postBookmark/postProgress из @/lib/api:
 * вызываются из client-компонентов (useOptimistic). Auth через session
 * cookie (HIGH-2): TelegramProvider при маунте автологинит юзера, cookie
 * подхватывается postAuthed → Authorization Bearer.
 *
 * Контракт: возвращают success/error без бросаемых исключений — client
 * сам решает revert по action.ok=false. Это нужно чтобы useOptimistic
 * корректно откатывался без error boundary boom'a.
 *
 * Brief §11 PERF — оптимистичный UI ≤16 мс. Эти actions выполняются вне
 * критического пути клика; useOptimistic уже показал нужное состояние.
 */
import {
  postBookmark,
  postProgress,
  postReaction,
  type ApiBookmarkResponse,
  type ApiReactionResponse,
  type ReactionKind,
} from "./api";
import { getSessionToken } from "./session";

export type ToggleReactionResult =
  | { ok: true; data: ApiReactionResponse }
  | { ok: false; reason: "no_auth" | "api_error" };

export type ToggleBookmarkResult =
  | { ok: true; data: ApiBookmarkResponse }
  | { ok: false; reason: "no_auth" | "api_error" };

async function classifyFailure(): Promise<"no_auth" | "api_error"> {
  const token = await getSessionToken();
  return token ? "api_error" : "no_auth";
}

export async function toggleReactionAction(
  articleId: string,
  kind: ReactionKind,
): Promise<ToggleReactionResult> {
  const data = await postReaction(articleId, kind);
  if (!data) {
    return { ok: false, reason: await classifyFailure() };
  }
  return { ok: true, data };
}

export async function toggleBookmarkAction(
  articleId: string,
): Promise<ToggleBookmarkResult> {
  const data = await postBookmark(articleId);
  if (!data) {
    return { ok: false, reason: await classifyFailure() };
  }
  return { ok: true, data };
}

/**
 * Report — fire-and-forget. Возвращает boolean только чтобы клиент мог
 * залогировать в dev. Client не должен ждать ответа.
 */
export async function reportProgressAction(
  articleId: string,
  readPercent: number,
  readSeconds?: number,
): Promise<boolean> {
  return postProgress(articleId, readPercent, readSeconds);
}
