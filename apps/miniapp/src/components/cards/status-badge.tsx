import type { CardStatus } from "@/lib/card-status";
import { Flame, Star, Zap } from "lucide-react";

/**
 * StatusBadge (П3) — пилюля статуса поста рядом с рубрикой: Срочно / Горячая /
 * Важная. Канон-палитра (CLAUDE.md §5): «горячее/срочное» — сплошной red
 * (цвет внимания), «важное» — мягкий red-tint (важно, но не breaking). Рубрика
 * остаётся золотой — так статус и рубрика визуально разведены.
 */
const STATUS: Record<CardStatus, { label: string; Icon: typeof Flame; className: string }> = {
  // text-paper (#F2F2F2), не text-white — канон §5. На сплошном red контраст ~5:1 (AA).
  urgent: {
    label: "Срочно",
    Icon: Zap,
    className: "bg-red text-paper",
  },
  hot: {
    label: "Горячая",
    Icon: Flame,
    className: "bg-red text-paper",
  },
  // «Важная» мягче (translucent red), но с text-paper на bg-red/20 — читаемо на
  // тёмном (bg-red/10 + text-red давало контраст ~3:1, ниже AA — находка ревью).
  important: {
    label: "Важная",
    Icon: Star,
    className: "border border-red/50 bg-red/20 text-paper",
  },
};

export function StatusBadge({ status }: { status: CardStatus | null }) {
  if (!status) return null;
  const { label, Icon, className } = STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2 py-1 font-display text-[10px] font-extrabold uppercase tracking-[0.1em] ${className}`}
    >
      <Icon size={11} strokeWidth={2.25} />
      {label}
    </span>
  );
}
