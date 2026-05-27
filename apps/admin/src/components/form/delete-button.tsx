"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";

/**
 * Delete-кнопка с confirm() перед submit. Внутри <form action={deleteAction}>.
 */
export function DeleteButton({
  label = "Удалить",
  confirmMessage = "Удалить навсегда?",
}: {
  label?: string;
  confirmMessage?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(confirmMessage)) e.preventDefault();
      }}
      className="flex items-center gap-2 rounded-lg border border-red/40 bg-red/[0.06] px-4 py-2 text-[12px] font-semibold text-red transition hover:bg-red/[0.12] disabled:opacity-50"
    >
      <Trash2 size={14} strokeWidth={1.75} /> {pending ? "Удаляем…" : label}
    </button>
  );
}
