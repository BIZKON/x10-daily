"use client";

import { CalendarDays, Loader2 } from "lucide-react";
import { useActionState } from "react";
import { buildPlan } from "./actions";
import { PLAN_FORM_IDLE } from "./form-state";

/**
 * Кнопка сборки плана.
 *
 * Сборка идёт около минуты и стоит денег, поэтому кнопка сразу говорит и то, и
 * другое: человек не должен узнавать о расходе из отчёта.
 */
export function BuildForm({ again = false }: { again?: boolean }) {
  const [state, action, pending] = useActionState(buildPlan, PLAN_FORM_IDLE);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-5 py-2.5 text-[13.5px] font-bold text-ink transition-opacity disabled:opacity-60"
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : <CalendarDays size={14} />}
        {pending ? "Собираем" : again ? "Пересобрать план" : "Собрать план на месяц"}
      </button>

      {state.status !== "idle" && (
        <span
          className={`text-[13px] ${state.status === "ok" ? "text-success" : "text-red"}`}
          role="status"
        >
          {state.message}
        </span>
      )}
    </form>
  );
}
