import type { ApiCategory } from "@/lib/api";

/**
 * Текстовая обложка для статей БЕЗ реального coverImageUrl (большинство
 * авто-материалов). П3: по просьбе Константина — БЕЗ фоновых изображений,
 * только текст. Раньше была крупная полупрозрачная иконка рубрики; убрана →
 * чистый steel→night градиент + тонкая канон-полоса (red/gold) сверху как
 * акцент рубрики. Текстовый контент (рубрика/статус/заголовок) карточка
 * передаёт в `children` — обложка не «висит» пустой, превью цельное.
 */
// Тинт-полоса — строго канон (red/gold, CLAUDE.md §5); рубрики различаются ею.
const TINT: Record<ApiCategory, string> = {
  taxes: "var(--color-red)",
  money: "var(--color-gold)",
  practice: "var(--color-gold)",
  power: "var(--color-red)",
  tech: "var(--color-gold)",
  rybakov: "var(--color-red)",
};

export function BrandedCover({
  category,
  className,
  children,
}: {
  category: ApiCategory;
  className?: string;
  children?: React.ReactNode;
}) {
  const tint = TINT[category];
  return (
    <div
      className={`relative overflow-hidden ${className ?? ""}`}
      style={{
        background: "linear-gradient(150deg, var(--color-steel) 0%, var(--color-night) 82%)",
      }}
    >
      <div
        className="absolute left-0 top-0 h-1 w-full"
        style={{ background: tint, opacity: 0.75 }}
      />
      {children}
    </div>
  );
}
