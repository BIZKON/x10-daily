import { Badge, Card, CardContent, CardHeader, CardTitle, cn } from "@x10/ui";
import Link from "next/link";
import type { FeedItem } from "@/lib/feed";

const sectionLabel: Record<FeedItem["section"], string> = {
  main: "Главное",
  numbers: "Цифры",
  people: "Люди",
  playbook: "Playbook",
  weekend: "Уикенд",
  longread: "Лонгрид",
  newsletter: "Рассылка",
};

export function FeedCard({ item }: { item: FeedItem }) {
  return (
    <Link
      href={`/article/${item.slug}`}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)] rounded-[var(--radius-web)]"
    >
      <Card
        className={cn(
          "bg-[#13131a] border-[var(--color-border-dark)] text-[var(--color-text-primary)] transition-colors",
          "hover:border-[var(--color-gold)]",
        )}
      >
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <Badge tone={item.isPaid ? "gold" : "muted"}>
              {sectionLabel[item.section]}
              {item.isPaid && " · X10+"}
            </Badge>
            <span className="x10-num text-xs text-[var(--color-text-secondary)]">
              {item.readSeconds}″
            </span>
          </div>
          <CardTitle className="text-[var(--color-text-primary)]">{item.tease}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-[var(--color-text-secondary)]">{item.lede}</CardContent>
      </Card>
    </Link>
  );
}
