import { Bolt, ChevronLeft, Headphones, HeartHandshake, MessageCircle, Play, Share2 } from "lucide-react";
import Image from "next/image";
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
    <main className="mx-auto min-h-dvh max-w-[640px]">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-fence bg-night/90 px-4 py-3.5 backdrop-blur-md">
        <Link href="/" aria-label="Назад" className="grid h-9 w-9 place-items-center">
          <ChevronLeft size={24} strokeWidth={1.75} />
        </Link>
        <div className="flex gap-4 text-mist">
          <button type="button" aria-label="Аудио">
            <Headphones size={20} strokeWidth={1.75} />
          </button>
          <button type="button" aria-label="Сохранить">
            <HeartHandshake size={20} strokeWidth={1.75} />
          </button>
          <button type="button" aria-label="Поделиться">
            <Share2 size={20} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <div className="relative">
        <Image
          src={article.imageUrl}
          alt=""
          width={1200}
          height={600}
          className="h-72 w-full object-cover"
          unoptimized
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-night/85" />
        <button
          type="button"
          aria-label="Смотреть"
          className="absolute inset-0 grid place-items-center"
        >
          <span className="grid h-16 w-16 place-items-center rounded-full bg-red/90 shadow-[0_8px_32px_rgba(230,57,70,0.4)]">
            <Play size={28} fill="currentColor" className="text-white" />
          </span>
        </button>
      </div>

      <article className="px-5 py-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-red">
            {article.category}
          </span>
          <span className="text-[12px] text-haze">
            · {article.readMinutes} мин чтения · 26 мая
          </span>
        </div>

        <h1 className="m-0 mb-4 font-display text-[27px] font-extrabold leading-[1.15]">
          {article.title}
        </h1>

        <p className="mb-6 text-[14px] leading-[1.6] text-mist">
          Минфин предложил поднять порог УСН с 265 до 350 млн ₽. Разобрали с налоговым адвокатом
          Дмитрием Костальгиным, что это значит для производства, услуг и e-commerce.
        </p>

        <aside className="mb-6 rounded-2xl border-l-[3px] border-red bg-card p-4">
          <div className="mb-2 flex items-center gap-2">
            <Bolt size={14} strokeWidth={2} className="text-red" />
            <span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-red">
              Почему это важно
            </span>
          </div>
          <p className="m-0 text-[15px] leading-[1.55]">
            <b className="font-bold">250+ тыс. ИП и ООО</b> остались бы на УСН вместо вынужденного
            перехода на ОСН с НДС 22%. Сэкономили бы суммарно{" "}
            <b className="font-bold">~120 млрд ₽</b> за 2026 год.
          </p>
        </aside>

        <h2 className="mb-3 mt-7 font-display text-xl font-extrabold">Что меняется по букве закона</h2>
        <p className="m-0 text-[16px] leading-[1.65] text-paper">
          В пояснительной записке Минфина предлагается с 1 января 2026 года повысить базовый порог
          годового дохода для применения УСН с 265 до 350 млн ₽. Это первая существенная индексация
          за три года…
        </p>

        <blockquote className="my-7 border-l-2 border-gold pl-5">
          <p className="m-0 font-display text-[22px] font-light italic leading-[1.3]">
            «350 млн — это не подарок государства, а возвращение к тому, что было съедено
            инфляцией».
          </p>
          <footer className="mt-3 flex items-center gap-2 text-[13px] text-mist">
            <span className="h-7 w-7 rounded-full [background:linear-gradient(135deg,var(--color-red),var(--color-gold))]" />
            <span>
              <b className="text-paper">Игорь Рыбаков</b> · сооснователь Технониколь
            </span>
          </footer>
        </blockquote>

        <div className="mt-8 flex items-center justify-between border-t border-fence pt-4">
          <div className="flex gap-2">
            {["🔥", "💯", "🤔", "😱"].map((e) => (
              <button
                key={e}
                type="button"
                className="rounded-pill border border-fence bg-card px-3 py-1.5 text-[15px]"
              >
                {e}
              </button>
            ))}
          </div>
          <button type="button" className="flex items-center gap-1.5 text-[13px] text-mist">
            <MessageCircle size={16} strokeWidth={1.75} className="text-red" /> {article.reactions}
          </button>
        </div>

        <div className="mt-7 rounded-2xl border border-gold/40 p-5 [background:linear-gradient(135deg,var(--color-steel),var(--color-night))]">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-gold">
            ✦ Х10 Сообщество
          </span>
          <h3 className="mb-1.5 mt-2 font-display text-lg font-extrabold">
            Обсудить в своём клампе
          </h3>
          <p className="m-0 text-[13px] text-mist">
            34 клампа уже обсуждают эту тему. Присоединись к разговору.
          </p>
          <button
            type="button"
            className="mt-4 rounded-xl bg-red px-5 py-2.5 font-display text-[13px] font-semibold text-white"
          >
            Открыть в Х10 →
          </button>
        </div>
      </article>
    </main>
  );
}
