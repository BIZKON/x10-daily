import { Badge } from "@x10/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadArticle, loadDailyFeed } from "@/lib/feed";

export async function generateStaticParams() {
  const items = await loadDailyFeed();
  return items.map((i) => ({ slug: i.slug }));
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await loadArticle(slug);
  if (!article) notFound();

  return (
    <main className="mx-auto min-h-dvh max-w-[640px] px-5 pb-20 pt-8">
      <Link
        href="/"
        className="mb-4 inline-block text-xs uppercase tracking-widest text-mist hover:text-gold"
      >
        ← К ленте
      </Link>

      <header className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <Badge tone={article.isPaid ? "gold" : "muted"}>{article.section}</Badge>
          <span className="x10-num text-xs text-mist">{article.readSeconds}″ чтения</span>
        </div>
        <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight">
          {article.tease}
        </h1>
      </header>

      <p className="mb-6 text-lg leading-relaxed text-paper">{article.lede}</p>

      <aside className="x10-callout font-sans text-sm leading-relaxed">
        <div className="mb-1.5 font-display text-xs font-bold uppercase tracking-wider text-gold">
          Почему важно
        </div>
        <div>
          Полный текст статьи появится <b>после Layer 4</b> — когда воркеры pipeline через Inngest
          начнут писать в Neon реальные публикации. Сейчас открыта только заглушка с {article.readSeconds}-секундным
          чтением.
        </div>
      </aside>
    </main>
  );
}
