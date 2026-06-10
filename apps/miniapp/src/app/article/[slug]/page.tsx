import { BookOpen, ChevronLeft, ExternalLink, Headphones, Quote } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArticleBody } from "@/components/article/article-body";
import { EngagementBar } from "@/components/article/engagement-bar";
import { HeaderShare } from "@/components/article/header-share";
import { ReadingProgress } from "@/components/article/reading-progress";
import { ANONYMOUS_USER_STATE, fetchArticleUserState } from "@/lib/api";
import { type ArticleDetail, loadArticle } from "@/lib/feed";

export async function generateStaticParams() {
  // Cache Components (Next 16) требует ≥1 результат. Реальных статей на билде нет
  // (бэкенд недоступен) — отдаём sentinel-slug; настоящие slug'и рендерятся
  // server-side в рантайме (loadArticle кэшируется per-slug, см. lib/feed.ts).
  return [{ slug: "__prerender_placeholder__" }];
}

const MONTHS = [
  "янв", "фев", "мар", "апр", "мая", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];
function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await loadArticle(slug);
  if (!article) notFound();

  const isDailyTake = article.template === "daily-take";
  const isDeepDive = article.template === "deep-dive";
  const dateLabel = formatDate(article.publishedAt);

  return (
    <main className="mx-auto min-h-dvh max-w-[640px]">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-fence bg-night/90 px-4 py-3.5 backdrop-blur-md">
        <Link href="/" aria-label="Назад" className="grid h-9 w-9 place-items-center">
          <ChevronLeft size={24} strokeWidth={1.75} />
        </Link>
        <div className="flex items-center gap-4 text-mist">
          {/* Audio — placeholder до AudioAgent через ElevenLabs proxy. */}
          <button type="button" aria-label="Аудио (скоро)" disabled className="opacity-40">
            <Headphones size={20} strokeWidth={1.75} />
          </button>
          <HeaderShare title={article.title} slug={article.slug} />
        </div>
      </header>

      {isDailyTake ? (
        <DailyTakeHero article={article} />
      ) : article.coverImageUrl ? (
        // Реальная обложка — рисуем hero-картинку. У авто-статей её обычно нет
        // (VisualAgent — post-M0), тогда ниже идёт чистый типографский хедер.
        <div className="relative">
          <Image
            src={article.coverImageUrl}
            alt=""
            width={1200}
            height={600}
            className="h-64 w-full object-cover"
            unoptimized
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-night/85" />
          {isDeepDive && (
            <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-pill bg-gold/95 px-3 py-1.5 font-display text-[10px] font-extrabold uppercase tracking-[0.15em] text-steel">
              <BookOpen size={11} strokeWidth={2.25} />
              Глубокий разбор · {article.readMinutes} мин
            </span>
          )}
        </div>
      ) : null}

      <article className="px-5 py-6">
        {!isDailyTake && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-red">
                {article.category}
              </span>
              <span className="text-[12px] text-haze">
                · {article.readMinutes} мин чтения{dateLabel ? ` · ${dateLabel}` : ""}
              </span>
            </div>
            <h1 className="m-0 mb-4 font-display text-[27px] font-extrabold leading-[1.15]">
              {article.title}
            </h1>
          </>
        )}

        {/* Lede — вводящая фраза */}
        <p className="mb-6 text-[15px] leading-[1.6] text-mist">{article.excerpt}</p>

        {/* «Почему это важно» — canon §5: сплошной steel + белый текст + красный акцент */}
        {article.whyItMatters && (
          <aside className="mb-6 rounded-2xl bg-steel p-4">
            <span className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.15em] text-red">
              Почему это важно
            </span>
            <p className="m-0 text-[15px] leading-[1.55] text-white">{article.whyItMatters}</p>
          </aside>
        )}

        {/* Тело статьи — структурированные блоки */}
        <ArticleBody blocks={article.body} />

        {/* Реакции / закладка (per-user state — в Suspense) */}
        <div className="mt-7">
          <Suspense fallback={<EngagementBarFallback article={article} />}>
            <ArticleEngagement article={article} />
          </Suspense>
        </div>

        {/* Источники — обязательны (ToV §6: цифры/цитаты с атрибуцией) */}
        {article.citations.length > 0 && (
          <div className="mt-7 border-t border-fence pt-5">
            <span className="mb-3 block text-[10px] font-extrabold uppercase tracking-[0.15em] text-haze">
              Источники
            </span>
            <ul className="m-0 list-none space-y-2 p-0">
              {article.citations.map((c, i) => (
                <li key={i}>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 text-[13px] leading-snug"
                  >
                    <ExternalLink size={13} strokeWidth={1.75} className="mt-0.5 shrink-0 text-haze" />
                    <span>
                      <span className="text-paper">{c.title}</span>
                      {c.publisher ? <span className="text-haze"> · {c.publisher}</span> : null}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Х10 Сообщество CTA — canon §5: steel, без градиента */}
        <div className="mt-7 rounded-2xl bg-steel p-5">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-gold">
            ✦ Х10 Сообщество
          </span>
          <h3 className="mb-1.5 mt-2 font-display text-lg font-extrabold text-white">
            Обсудить в своём клампе
          </h3>
          <p className="m-0 text-[13px] text-white/70">
            Клампы уже обсуждают деловую повестку. Присоединяйся к разговору.
          </p>
          <button
            type="button"
            className="mt-4 rounded-xl bg-red px-5 py-2.5 font-display text-[13px] font-semibold text-white"
          >
            Открыть в Х10 →
          </button>
        </div>
      </article>

      <ReadingProgress articleId={article.id} />
    </main>
  );
}

/**
 * Async RSC внутри Suspense — фетчит per-user snapshot (session cookie → Bearer).
 * Без auth — fetchArticleUserState вернёт нули, bar отрисуется в guest-режиме.
 */
async function ArticleEngagement({ article }: { article: ArticleDetail }) {
  const userState = await fetchArticleUserState(article.id);
  return (
    <EngagementBar
      articleId={article.id}
      initialUserState={userState}
      initialReactions={article.reactionBreakdown}
      initialBookmarkCount={article.bookmarkCount}
      commentCount={article.comments}
    />
  );
}

/** Fallback на время загрузки user state — рендерим bar в guest-режиме. */
function EngagementBarFallback({ article }: { article: ArticleDetail }) {
  return (
    <EngagementBar
      articleId={article.id}
      initialUserState={ANONYMOUS_USER_STATE}
      initialReactions={article.reactionBreakdown}
      initialBookmarkCount={article.bookmarkCount}
      commentCount={article.comments}
    />
  );
}

/**
 * Hero для daily-take (brief §3.3): без обложки, фокус на авторе и цитате.
 */
function DailyTakeHero({ article }: { article: ArticleDetail }) {
  const authorName = article.authorName ?? "Редакция";
  const initial = authorName.charAt(0);

  return (
    <div className="border-b border-gold/30 bg-card px-5 py-7">
      <div className="mb-5 flex items-center gap-3">
        <span
          className="grid h-14 w-14 place-items-center rounded-full font-display text-xl font-extrabold text-night"
          style={{ background: "linear-gradient(135deg, var(--color-red), var(--color-gold))" }}
        >
          {initial}
        </span>
        <div className="flex-1">
          <div className="font-display text-[15px] font-extrabold text-paper">{authorName}</div>
          <div className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-gold">
            {article.category} · реакция дня · {article.readMinutes} мин
          </div>
        </div>
      </div>

      <div className="relative pl-7">
        <Quote size={28} strokeWidth={1.25} className="absolute left-0 top-0 text-gold/70" aria-hidden />
        <h1 className="m-0 font-display text-[26px] font-extrabold leading-[1.15] text-paper">
          {article.title}
        </h1>
      </div>
    </div>
  );
}
