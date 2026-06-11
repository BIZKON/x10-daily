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
      {blocks.map((block) => (
        <BlockView key={JSON.stringify(block)} block={block} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: ApiArticleBlock }) {
  switch (block.type) {
    case "paragraph":
      return <p className="m-0 text-[16px] leading-[1.65] text-paper">{block.text}</p>;

    case "quote":
      return (
        <blockquote className="my-1 border-l-2 border-gold pl-5">
          <p className="m-0 font-display text-[20px] font-light italic leading-[1.35] text-paper">
            «{block.text}»
          </p>
          <footer className="mt-2 text-[13px] text-mist">— {block.attribution}</footer>
        </blockquote>
      );

    case "numbers":
      return (
        <div className="rounded-2xl bg-steel p-4">
          <div className="space-y-2.5">
            {block.items.map((it) => (
              <div
                key={it.label}
                className="flex items-baseline justify-between gap-3 border-b border-white/10 pb-2.5 last:border-0 last:pb-0"
              >
                <span className="text-[13px] leading-snug text-white/70">{it.label}</span>
                <span className="x10-num shrink-0 text-[16px] font-bold text-gold">{it.value}</span>
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
          <p className="m-0 text-[15px] leading-[1.55] text-white">{block.text}</p>
        </aside>
      );
    }

    case "list":
      return block.ordered ? (
        <ol className="m-0 list-decimal space-y-1.5 pl-5 text-[16px] leading-[1.6] text-paper">
          {block.items.map((it) => (
            <li key={it}>{it}</li>
          ))}
        </ol>
      ) : (
        <ul className="m-0 list-disc space-y-1.5 pl-5 text-[16px] leading-[1.6] text-paper">
          {block.items.map((it) => (
            <li key={it}>{it}</li>
          ))}
        </ul>
      );

    default:
      return null;
  }
}
