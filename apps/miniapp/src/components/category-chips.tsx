"use client";

import { cn } from "@x10/ui";
import { useState } from "react";

export function CategoryChips({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((c) => {
        const isActive = c.id === active;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => setActive(c.id)}
            className={cn(
              "whitespace-nowrap rounded-pill px-4 py-2 text-[13px] font-semibold transition-colors",
              isActive
                ? "bg-red text-white"
                : "border border-fence bg-card text-mist hover:text-paper",
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
