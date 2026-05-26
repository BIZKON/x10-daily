import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 font-display text-xs font-semibold uppercase tracking-wide",
  {
    variants: {
      tone: {
        red: "bg-red text-white",
        gold: "bg-gold text-steel",
        steel: "bg-steel text-white",
        muted: "bg-border text-steel",
      },
    },
    defaultVariants: { tone: "steel" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ tone }), className)} {...props} />
  ),
);
Badge.displayName = "Badge";

export { badgeVariants };
