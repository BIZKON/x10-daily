import { isDemoMode } from "@/lib/api";
import { Info } from "lucide-react";

/**
 * Показывается когда api не настроен (X10_API_BASE_URL пустой) — то есть в
 * локальной разработке. У клиента такого быть не должно, но текст всё равно
 * человеческий: баннер общий для всех страниц, и увидеть его может кто угодно.
 */
export function DemoBanner() {
  if (!isDemoMode()) return null;
  return (
    <div className="flex items-center gap-2 border-b border-gold/30 bg-gold/[0.08] px-8 py-2.5 text-[12px] text-gold">
      <Info size={13} strokeWidth={2} />
      <span>
        <strong>Демо-режим.</strong> Кабинет не подключён к серверу — всё, что ниже, показано для
        примера и никуда не сохраняется.
      </span>
    </div>
  );
}
