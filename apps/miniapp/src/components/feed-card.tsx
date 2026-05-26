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
      className="block rounded-web focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      <Card
        className={cn(
          "bg-card border-fence text-paper transition-colors",
          "hover:border-gold",
        )}
      >
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <Badge tone={item.isPaid ? "gold" : "muted"}>
              {sectionLabel[item.section]}
              {item.isPaid && " · X10+"}
            </Badge>
            <span className="x10-num text-xs text-mist">{item.readSeconds}″</span>
          </div>
          <CardTitle className="text-paper">{item.tease}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-mist">{item.lede}</CardContent>
      </Card>
    </Link>
  );
}
