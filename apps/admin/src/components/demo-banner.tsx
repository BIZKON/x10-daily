import { isDemoMode } from "@/lib/api";
import { Info } from "lucide-react";

/**
 * Показывается когда apps/api не настроен (X10_API_BASE_URL пустой).
 * Тонкая жёлтая полоска поверх контента — даёт понять что данные не реальные.
 */
export function DemoBanner() {
  if (!isDemoMode()) return null;
  return (
    <div className="flex items-center gap-2 border-b border-gold/30 bg-gold/[0.08] px-8 py-2.5 text-[12px] text-gold">
      <Info size={13} strokeWidth={2} />
      <span>
        <strong>Demo mode.</strong> Данные ниже — фейковые fixtures (apps/api недоступен). Для
        реальной работы задай <code className="font-mono text-paper">X10_API_BASE_URL</code> в{" "}
        <code className="font-mono text-paper">apps/admin/.env.local</code> и подними{" "}
        <code className="font-mono text-paper">wrangler dev</code> в apps/api.
      </span>
    </div>
  );
}
