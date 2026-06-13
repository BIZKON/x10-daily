import { Banknote, Cpu, Landmark, Lightbulb, type LucideIcon, Quote, Scale } from "lucide-react";
import type { ApiCategory } from "@/lib/api";

/**
 * Самодостаточная обложка для статей БЕЗ реального coverImageUrl (большинство
 * авто-материалов). Заменяет внешние unsplash-плейсхолдеры: быстрее и надёжнее
 * из РФ (нет внешнего US-CDN, нет повторяющихся стоковых фото) и на бренде
 * (steel→night + акцент канона). Рисуется ПОД оверлеями карточки (бейджи сверху,
 * заголовок снизу у deep-dive) — night-низ даёт контраст для белого текста.
 * Категория дублируется текстом в самой карточке, поэтому здесь только иконка.
 */
// Тинты — строго канон (red/gold, CLAUDE.md §5). 6 рубрик различаются ИКОНКОЙ,
// цвет циклится red/gold (без внеканонных синего/бирюзового).
const COVER: Record<ApiCategory, { Icon: LucideIcon; tint: string }> = {
  taxes: { Icon: Landmark, tint: "var(--color-red)" },
  money: { Icon: Banknote, tint: "var(--color-gold)" },
  practice: { Icon: Lightbulb, tint: "var(--color-gold)" },
  power: { Icon: Scale, tint: "var(--color-red)" },
  tech: { Icon: Cpu, tint: "var(--color-gold)" },
  rybakov: { Icon: Quote, tint: "var(--color-red)" },
};

export function BrandedCover({
  category,
  className,
}: {
  category: ApiCategory;
  className?: string;
}) {
  const { Icon, tint } = COVER[category];
  return (
    <div
      aria-hidden
      className={`relative overflow-hidden ${className ?? ""}`}
      style={{ background: "linear-gradient(150deg, var(--color-steel) 0%, var(--color-night) 78%)" }}
    >
      <Icon
        className="absolute right-5 top-1/2 -translate-y-1/2 opacity-[0.16]"
        size={132}
        strokeWidth={1}
        style={{ color: tint }}
      />
      <div
        className="absolute left-0 top-0 h-1 w-full"
        style={{ background: tint, opacity: 0.7 }}
      />
    </div>
  );
}
