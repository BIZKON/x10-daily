import type { ApiArticleBlock } from "@/lib/feed";

/**
 * Рендер тела статьи из структурированных блоков (ApiArticleBlock).
 * Дизайн-канон (CLAUDE.md §5): смысловые выноски — сплошной steel-фон + белый
 * текст + золотые/красные акценты (без градиентов); числа — JetBrains Mono
 * (.x10-num); цитаты — золотая левая линия.
 */

const CALLOUT_META: Record<string, { label: string; accent: string }> = {
  why: { label: "Почему это важно", accent: "text-red" },
  "yes-but": { label: "Да, но", accent: "text-gold" },
  "what-next": { label: "Что дальше", accent: "text-gold" },
  "big-picture": { label: "Картина шире", accent: "text-gold" },
};

export function ArticleBody({ blocks }: { blocks: ApiArticleBlock[] }) {
  if (!blocks?.length) return null;
  return (
    <div className="space-y-5">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: ApiArticleBlock }) {
  switch (block.type) {
    // `break-words` во всех текстовых блоках: контент приходит от модели и может
    // содержать длинный URL/термин без пробелов — иначе он распирает вёрстку.
    case "paragraph":
      return (
        <p className="m-0 break-words text-[16px] leading-[1.65] text-paper">{block.text}</p>
      );

    case "quote":
      return (
        <blockquote className="my-1 border-l-2 border-gold pl-5">
          <p className="m-0 break-words font-display text-[20px] font-light italic leading-[1.35] text-paper">
            «{block.text}»
          </p>
          <footer className="mt-2 break-words text-[13px] text-mist">— {block.attribution}</footer>
        </blockquote>
      );

    case "numbers":
      return (
        <div className="rounded-2xl bg-steel p-4">
          <div className="space-y-2.5">
            {block.items.map((it, j) => (
              // Значение не всегда короткое число — модель пишет и «в 2 раза по
              // сравнению с Claude Opus 4». Раньше на нём стоял `shrink-0` → оно
              // не сжималось и вылезало за границу карточки.
              // ⚠️ `flex-wrap` тут НЕ подходит (проверено на 94 живых строках):
              // перенос во flex считается по max-content, поэтому длинная ПОДПИСЬ
              // занимала всю строку и выталкивала вниз даже короткое «36%», а
              // `justify-between` при одном элементе в строке прижимал его влево —
              // ритм блока рвался на 36 строках, которые были в порядке.
              // Решение: строка остаётся одной, перенос живёт ВНУТРИ колонки
              // значения (`min-w-0` + потолок ширины + `overflow-wrap`).
              <div
                key={j}
                className="flex items-baseline justify-between gap-3 border-b border-white/10 pb-2.5 last:border-0 last:pb-0"
              >
                <span className="min-w-0 text-[13px] leading-snug text-white/70">{it.label}</span>
                <span className="x10-num min-w-0 max-w-[60%] text-right text-[16px] font-bold text-gold [overflow-wrap:anywhere]">
                  {it.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      );

    case "callout": {
      const meta = CALLOUT_META[block.kind] ?? { label: block.kind, accent: "text-gold" };
      return (
        <aside className="rounded-2xl bg-steel p-4">
          <span
            className={`mb-2 block text-[10px] font-extrabold uppercase tracking-[0.15em] ${meta.accent}`}
          >
            {meta.label}
          </span>
          <p className="m-0 break-words text-[15px] leading-[1.55] text-white">{block.text}</p>
        </aside>
      );
    }

    case "list":
      return block.ordered ? (
        <ol className="m-0 list-decimal space-y-1.5 break-words pl-5 text-[16px] leading-[1.6] text-paper">
          {block.items.map((it, j) => (
            <li key={j}>{it}</li>
          ))}
        </ol>
      ) : (
        <ul className="m-0 list-disc space-y-1.5 break-words pl-5 text-[16px] leading-[1.6] text-paper">
          {block.items.map((it, j) => (
            <li key={j}>{it}</li>
          ))}
        </ul>
      );

    default:
      return null;
  }
}
