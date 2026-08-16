"use client";

import { Printer } from "lucide-react";

/**
 * Печать счёта средствами браузера.
 *
 * Отдельная кнопка, потому что Ctrl+P знают не все, а «Сохранить как PDF» в
 * диалоге печати есть в каждом браузере — отдельный PDF-пакет ради одной
 * страницы не нужен.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-2 rounded-xl bg-[#7C3AED] px-4 py-2 text-[13px] font-bold text-white"
    >
      <Printer size={14} /> Печать или PDF
    </button>
  );
}
