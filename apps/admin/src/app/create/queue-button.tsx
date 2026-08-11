"use client";

import { Loader2, Send } from "lucide-react";
import { useActionState } from "react";
import { queueMaterial } from "./actions";
import { CREATE_FORM_IDLE } from "./form-state";

/**
 * «Отправить в очередь» у готового задания.
 *
 * Кнопка есть только у готовых и ещё не отправленных: у остальных её
 * отсутствие — само по себе ответ. Показывать её отключённой значило бы
 * предлагать действие и тут же отказывать.
 *
 * Подпись говорит про очередь, а не про публикацию, потому что публикует не
 * она: материал уйдёт в канал только после одобрения редактором.
 */
export function QueueButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(queueMaterial, CREATE_FORM_IDLE);

  if (state.status === "ok") {
    return <span className="shrink-0 text-[11.5px] text-success">Отправлено</span>;
  }

  return (
    <form action={action} className="flex shrink-0 items-center gap-2">
      <input type="hidden" name="id" value={id} />
      {state.status === "error" && (
        <span className="max-w-[220px] text-[11px] leading-snug text-red">{state.message}</span>
      )}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-fence px-3 py-1.5 text-[12px] font-semibold text-mist transition-colors hover:border-mist/50 hover:text-paper disabled:opacity-60"
      >
        {pending ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Send size={13} strokeWidth={1.75} />
        )}
        {pending ? "Отправляем" : "В очередь"}
      </button>
    </form>
  );
}
