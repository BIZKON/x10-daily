"use client";

import { HandCoins, Loader2 } from "lucide-react";
import { useActionState } from "react";
import { joinProgram } from "./actions";
import { JOIN_IDLE } from "./form-state";

/**
 * «Стать партнёром» — одна кнопка без формы.
 *
 * После успеха страница перерисовывается кабинетом: отдельного экрана «спасибо»
 * нет, человек попадает туда, куда шёл.
 */
export function JoinButton({ ref: refCode }: { ref?: string }) {
  const [state, action, pending] = useActionState(joinProgram, JOIN_IDLE);

  return (
    <form action={action}>
      {refCode && <input type="hidden" name="ref" value={refCode} />}
      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gold px-5 py-4 font-display text-[16px] font-extrabold text-ink transition-opacity disabled:opacity-60"
      >
        {pending ? <Loader2 size={17} className="animate-spin" /> : <HandCoins size={17} />}
        {pending ? "Подключаем" : "Стать партнёром"}
      </button>
      {state.status === "error" && (
        <output className="mt-2 block text-center text-[13px] text-red">{state.message}</output>
      )}
    </form>
  );
}
