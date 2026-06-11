import * as React from "react";
import { cn } from "../lib/cn";

type CalloutKind = "why" | "yes-but" | "what-next" | "big-picture";

const labelByKind: Record<CalloutKind, string> = {
  why: "Почему важно",
  "yes-but": "Да, но",
  "what-next": "Что дальше",
  "big-picture": "Контекст",
};

export interface CalloutProps extends React.HTMLAttributes<HTMLDivElement> {
  kind: CalloutKind;
  label?: string;
}

/**
 * Smart Brevity callout — сплошной steel-фон, никаких градиентов
 * (запрет зафиксирован в CLAUDE.md §5).
 */
export const Callout = React.forwardRef<HTMLDivElement, CalloutProps>(
  ({ className, kind, label, children, ...props }, ref) => (
    <aside
      ref={ref}
      className={cn("x10-callout font-sans text-sm leading-relaxed", className)}
      {...props}
    >
      <div className="mb-1.5 font-display text-xs font-bold uppercase tracking-wider text-gold">
        {label ?? labelByKind[kind]}
      </div>
      <div>{children}</div>
    </aside>
  ),
);
Callout.displayName = "Callout";
