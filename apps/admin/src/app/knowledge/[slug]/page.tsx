import { fetchKnowledgeShelf } from "@/lib/api";
import { ChevronLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AnswerForm } from "../answer-form";
import { deleteKbDocument } from "../actions";

export const metadata = { title: "Полка базы знаний — ProAgent AI Admin" };

/**
 * Одна полка базы знаний: чем она наполнена и как дополнить.
 *
 * Материалы показываем ЦЕЛИКОМ, а не превью в одну строку. Клиент должен
 * видеть ровно тот текст, который уедет в промпт: сокращённый показ создаёт
 * ощущение, что система знает больше, чем ей сказали.
 */
export default function ShelfPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="h-9 w-40 animate-pulse rounded-xl bg-card" />
      <div className="h-64 animate-pulse rounded-2xl bg-card" />
    </div>
  );
}

async function Content({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchKnowledgeShelf(slug);
  if (!data) notFound();

  const { shelf, documents } = data;
  const ready = documents.filter((d) => d.status === "ready");

  return (
    <article>
      <Link
        href="/knowledge"
        className="mb-5 inline-flex items-center gap-2 text-[13px] text-mist hover:text-paper"
      >
        <ChevronLeft size={16} strokeWidth={1.75} /> База знаний
      </Link>

      <header className="mb-6">
        <h1 className="m-0 mb-2 font-display text-2xl font-extrabold leading-tight">
          {shelf.title}
        </h1>
        <p className="m-0 max-w-[70ch] text-[14px] leading-relaxed text-mist">{shelf.purpose}</p>
      </header>

      <section className="mb-6 rounded-2xl border border-fence bg-card p-5">
        <h2 className="m-0 mb-1.5 font-display text-[16px] font-bold leading-snug">
          {shelf.question}
        </h2>
        {shelf.hint && <p className="m-0 mb-3 text-[13px] leading-relaxed text-mist">{shelf.hint}</p>}
        <AnswerForm
          slug={shelf.slug}
          fallbackTitle={shelf.title}
          placeholder="Добавьте ещё сведения на эту полку…"
          submitLabel="Добавить"
        />
      </section>

      <h2 className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.15em] text-mist">
        На полке — {ready.length}{" "}
        {ready.length === 1 ? "материал" : ready.length < 5 ? "материала" : "материалов"}
      </h2>

      {documents.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-fence bg-card p-6 text-center text-[13.5px] text-mist">
          Пока пусто. Пока полка пустая, система об этом просто не пишет — это лучше, чем догадка.
        </p>
      ) : (
        <ul className="m-0 list-none space-y-3 p-0">
          {documents.map((d) => (
            <li key={d.id} className="rounded-2xl border border-fence bg-card p-5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-display text-[15px] font-bold">{d.title}</span>
                {d.status === "parsing" && (
                  <span className="rounded-pill bg-gold/15 px-2.5 py-1 font-mono text-[10.5px] text-gold">
                    разбираем
                  </span>
                )}
                {d.status === "failed" && (
                  <span className="rounded-pill bg-red/15 px-2.5 py-1 font-mono text-[10.5px] text-red">
                    не удалось прочитать
                  </span>
                )}
                <span className="ml-auto font-mono text-[11px] text-haze">
                  {d.charCount.toLocaleString("ru-RU")} знаков
                </span>
              </div>

              {d.statusReason && (
                <p className="m-0 mb-2 text-[12.5px] text-red">{d.statusReason}</p>
              )}

              <p className="m-0 whitespace-pre-wrap text-[14px] leading-relaxed text-paper">
                {d.body}
              </p>

              <form action={deleteKbDocument} className="mt-3">
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="slug" value={shelf.slug} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-fence px-3 py-1.5 text-[12.5px] text-mist transition-colors hover:border-red/50 hover:text-red"
                >
                  <Trash2 size={13} strokeWidth={1.75} /> Удалить
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
