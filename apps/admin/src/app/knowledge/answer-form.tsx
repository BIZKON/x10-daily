"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { addKbDocument } from "./actions";
import { KB_FORM_IDLE } from "./form-state";

/**
 * Поле ответа на вопрос полки.
 *
 * Заголовка у формы нет намеренно: человек отвечает на вопрос, а не
 * придумывает название материалу. Название подставит сервер из названия полки
 * — лишнее поле в анкете снижает шанс, что до конца дойдут.
 */
export function AnswerForm({
  slug,
  fallbackTitle,
  placeholder = "Напишите своими словами…",
  submitLabel = "Сохранить",
}: {
  slug: string;
  fallbackTitle: string;
  placeholder?: string;
  submitLabel?: string;
}) {
  const [state, action, pending] = useActionState(addKbDocument, KB_FORM_IDLE);

  return (
    <form action={action}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="fallbackTitle" value={fallbackTitle} />

      <textarea
        name="body"
        rows={4}
        required
        placeholder={placeholder}
        className="w-full resize-y rounded-xl border border-fence bg-ink px-3.5 py-3 text-[14px] leading-relaxed text-paper outline-none placeholder:text-haze focus-visible:border-gold"
      />

      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-5 py-2.5 text-[13.5px] font-bold text-ink transition-opacity disabled:opacity-60"
        >
          {pending && <Loader2 size={14} className="animate-spin" />}
          {pending ? "Сохраняем" : submitLabel}
        </button>

        {state.status !== "idle" && (
          <span
            className={`text-[13px] ${state.status === "ok" ? "text-success" : "text-red"}`}
            role="status"
          >
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
