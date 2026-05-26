"use client";

import { Badge } from "@x10/ui";
import { useEffect, useState } from "react";

const fmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });

export function TodayBadge() {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    setLabel(fmt.format(new Date()));
  }, []);
  return <Badge tone="red">{label ?? "—"}</Badge>;
}
