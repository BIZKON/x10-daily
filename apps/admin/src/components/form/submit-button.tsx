"use client";

import { useFormStatus } from "react-dom";

/**
 * Кнопка отправки формы с автоматическим pending-state.
 * Должна быть внутри <form action={...}>.
 */
export function SubmitButton({
  label = "Сохранить",
  pendingLabel = "Сохраняем…",
}: {
  label?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-red px-5 py-2.5 font-display text-[13px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
