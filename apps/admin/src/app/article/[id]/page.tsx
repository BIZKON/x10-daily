import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchArticleDetail, type ArticleDetail } from "@/lib/api";
import { publishAction } from "./publish-action";

export default async function ArticleReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const article = await fetchArticleDetail(id);
  if (!article) notFound();

  return (
    <article>
      <header className="mb-6 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 text-[13px] text-mist hover:text-paper">
          <ChevronLeft size={16} strokeWidth={1.75} /> Очередь
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.15em]">
          <span className="text-red">{article.category}</span>
          {article.subcategory && (
            <span className="font-mono normal-case text-haze">{article.subcategory}</span>
          )}
          <span className="rounded-pill border border-fence bg-night px-2 py-0.5 font-mono normal-case tracking-normal text-gold">
            {article.template}
          </span>
          <StatusBadge status={article.status} />
        </div>
      </header>

      {article.tags.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          {article.tags.map((t) => (
            <span
              key={t}
              className="rounded-pill border border-fence bg-card px-2.5 py-1 font-mono text-[11px] text-mist"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-2xl border border-red/40 bg-red/10 p-4 text-[13px] text-red">
          Ошибка публикации: <code className="font-mono">{error}</code>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <DraftPanel article={article} />
        </div>
        <aside className="space-y-4">
          <ScorePanel metadata={article.metadata} />
          <FactCheckPanel metadata={article.metadata} />
          <PublishPanel id={article.id} status={article.status} />
          <BrevityPanel metadata={article.metadata} />
          <HooksPanel metadata={article.metadata} />
          <SocialPanel metadata={article.metadata} />
          <CostPanel metadata={article.metadata} />
        </aside>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "ready"
      ? "border-gold/40 bg-gold/10 text-gold"
      : status === "published"
        ? "border-success/40 bg-success/10 text-success"
        : "border-fence bg-card text-mist";
  return (
    <span
      className={`rounded-pill border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider ${cls}`}
    >
      {status}
    </span>
  );
}

function DraftPanel({ article }: { article: ArticleDetail }) {
  return (
    <section className="rounded-2xl border border-fence bg-card p-6">
      <div className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-red">
        Tease
      </div>
      <h1 className="m-0 mb-4 font-display text-2xl font-extrabold leading-tight">
        {article.tease}
      </h1>

      <div className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-mist">
        Lede
      </div>
      <p className="mb-5 text-[15px] leading-relaxed text-paper">{article.lede}</p>

      {article.whyItMatters && (
        <aside className="mb-5 rounded-2xl border-l-[3px] border-red bg-night p-4">
          <div className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-red">
            Почему это важно
          </div>
          <p className="m-0 text-[14px] leading-relaxed">{article.whyItMatters}</p>
        </aside>
      )}

      <div className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-mist">
        Body ({article.body.length} блоков · {article.wordCount} слов · {Math.round(article.readSeconds / 60)} мин)
      </div>
      <div className="space-y-4">
        {article.body.map((block, i) => (
          <BodyBlock key={i} block={block} />
        ))}
      </div>

      {article.citations.length > 0 && (
        <>
          <div className="mt-6 mb-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-mist">
            Источники ({article.citations.length})
          </div>
          <ul className="space-y-1.5 text-[13px]">
            {article.citations.map((c, i) => (
              <li key={i}>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold hover:underline"
                >
                  {c.publisher}: {c.title}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function BodyBlock({ block }: { block: ArticleDetail["body"][number] }) {
  switch (block.type) {
    case "paragraph":
      return <p className="m-0 text-[15px] leading-relaxed text-paper">{block.text}</p>;
    case "callout":
      return (
        <aside className="rounded-2xl border-l-[3px] border-gold bg-night p-3.5">
          <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.15em] text-gold">
            {block.kind}
          </div>
          <p className="m-0 text-[14px] leading-relaxed">{block.text}</p>
        </aside>
      );
    case "numbers":
      return (
        <div className="rounded-2xl border border-fence bg-night p-3.5">
          <div className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-mist">
            Numbers
          </div>
          <ul className="space-y-1.5">
            {block.items.map((n, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-mist">{n.label}</span>
                <span className="font-mono font-bold text-paper">{n.value}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-gold pl-4">
          <p className="m-0 font-display text-[18px] italic leading-snug">«{block.text}»</p>
          <footer className="mt-2 text-[12px] text-mist">— {block.attribution}</footer>
        </blockquote>
      );
    case "list":
      return (
        <ul className={`ml-5 space-y-1 text-[14px] ${block.ordered ? "list-decimal" : "list-disc"}`}>
          {block.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      );
  }
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-fence bg-card p-5">
      <h3 className="m-0 mb-3 text-[10px] font-extrabold uppercase tracking-[0.15em] text-mist">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ScorePanel({ metadata }: { metadata: ArticleDetail["metadata"] }) {
  const score = metadata?.score;
  if (!score) return null;
  const items = [
    { k: "Hook", v: score.breakdown.hookStrength },
    { k: "Voice", v: score.breakdown.voiceMatch },
    { k: "Value", v: score.breakdown.valueDensity },
    { k: "Structure", v: score.breakdown.structureFormat },
    { k: "Ready", v: score.breakdown.publishReadiness },
  ];
  const cls =
    score.total >= 40
      ? "text-success"
      : score.total >= 30
        ? "text-gold"
        : "text-red";
  return (
    <Card title="PreviewScore">
      <div className="mb-3 flex items-baseline gap-2">
        <span className={`font-display text-3xl font-extrabold ${cls}`}>{score.total}</span>
        <span className="font-mono text-[12px] text-haze">/ 50</span>
      </div>
      <p className="m-0 mb-3 text-[12px] leading-relaxed text-mist">{score.verdict}</p>
      <dl className="space-y-1.5">
        {items.map((it) => (
          <div key={it.k} className="flex items-center justify-between text-[12px]">
            <dt className="text-mist">{it.k}</dt>
            <dd className="font-mono font-bold text-paper">{it.v}/10</dd>
          </div>
        ))}
      </dl>
      {score.fixes.length > 0 && (
        <>
          <div className="mt-4 mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.15em] text-mist">
            Fixes ({score.fixes.length})
          </div>
          <ul className="space-y-2 text-[12px]">
            {score.fixes.map((f, i) => (
              <li key={i} className="rounded-lg border border-fence bg-night p-2.5">
                <div className="font-mono text-[10px] text-gold">{f.criterion}</div>
                <div className="mt-1 text-mist">{f.issue}</div>
                <div className="mt-1 text-paper">→ {f.suggestion}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function FactCheckPanel({ metadata }: { metadata: ArticleDetail["metadata"] }) {
  const fc = metadata?.factcheck;
  if (!fc) return null;
  const cls =
    fc.status === "passed"
      ? "text-success"
      : fc.status === "review-needed"
        ? "text-gold"
        : "text-red";
  return (
    <Card title="FactCheck (Opus)">
      <div className={`mb-2 font-display text-lg font-extrabold ${cls}`}>{fc.status}</div>
      {fc.haltReason && (
        <p className="m-0 mb-3 text-[12px] leading-relaxed text-red">{fc.haltReason}</p>
      )}
      <ul className="space-y-2 text-[12px]">
        {fc.claims.slice(0, 5).map((c, i) => (
          <li key={i} className="rounded-lg border border-fence bg-night p-2.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-gold">{c.location}</span>
              <span className={`font-mono text-[10px] ${c.verdict === "supported" ? "text-success" : c.verdict === "contradicted" ? "text-red" : "text-gold"}`}>
                {c.verdict}
              </span>
              <span className="font-mono text-[10px] text-haze">{c.confidence}</span>
            </div>
            <div className="mt-1 text-paper">{c.claim}</div>
            <div className="mt-1 text-mist">{c.rationale}</div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PublishPanel({ id, status }: { id: string; status: string }) {
  const canPublish = status === "ready";
  return (
    <Card title="Действие">
      <form action={publishAction}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={!canPublish}
          className="w-full rounded-xl bg-red px-5 py-3 font-display text-[14px] font-extrabold text-white transition-colors hover:bg-red-deep disabled:cursor-not-allowed disabled:opacity-50"
        >
          {canPublish ? "Publish →" : status === "published" ? "Уже опубликовано" : `Статус: ${status}`}
        </button>
      </form>
      <p className="m-0 mt-2 text-[11px] text-haze">
        Переведёт status='published', выставит publishedAt = now. Появится в /v1/feed/daily.
      </p>
    </Card>
  );
}

function BrevityPanel({ metadata }: { metadata: ArticleDetail["metadata"] }) {
  const b = metadata?.brevity;
  if (!b) return null;
  return (
    <Card title="Brevity">
      <div className="mb-2 flex items-baseline gap-2 text-[12px]">
        <span className="font-mono font-bold text-paper">{b.afterWords}</span>
        <span className="text-haze">/</span>
        <span className="font-mono text-haze">{b.beforeWords} слов</span>
        <span className="ml-auto font-mono text-[11px] text-success">
          -{b.beforeWords - b.afterWords}
        </span>
      </div>
      {b.cuts.length > 0 && (
        <ul className="space-y-1 text-[12px] text-mist">
          {b.cuts.map((c, i) => (
            <li key={i}>· {c}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function HooksPanel({ metadata }: { metadata: ArticleDetail["metadata"] }) {
  const hooks = metadata?.hooks;
  if (!hooks || hooks.length === 0) return null;
  return (
    <Card title="Hooks (6 паттернов)">
      <ul className="space-y-2 text-[12px]">
        {hooks.map((h, i) => (
          <li key={i} className="rounded-lg border border-fence bg-night p-2.5">
            <div className="font-mono text-[10px] text-gold">{h.pattern}</div>
            <div className="mt-1 whitespace-pre-line text-paper">{h.text}</div>
            <div className="mt-1 text-mist">{h.reasoning}</div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SocialPanel({ metadata }: { metadata: ArticleDetail["metadata"] }) {
  const s = metadata?.social;
  if (!s) return null;
  return (
    <Card title="Social">
      <div className="mb-2 flex items-center gap-2 font-mono text-[11px]">
        <span className="text-gold">{s.channel}</span>
        <span className="text-haze">·</span>
        <span className="text-mist">{s.framework}</span>
        <span className="ml-auto text-haze">
          {s.wordCount} слов · {s.lineCount} строк
        </span>
      </div>
      <pre className="m-0 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-fence bg-night p-3 font-sans text-[12px] leading-relaxed text-paper">
        {s.post}
      </pre>
    </Card>
  );
}

function CostPanel({ metadata }: { metadata: ArticleDetail["metadata"] }) {
  const cost = metadata?.totalCostUsd;
  if (cost === undefined) return null;
  return (
    <Card title="Cost">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-lg font-bold text-paper">${cost.toFixed(4)}</span>
        <span className="text-[12px] text-haze">за статью</span>
      </div>
    </Card>
  );
}
