import { DeleteButton } from "@/components/form/delete-button";
import { fetchAdminAuthorBySlug } from "@/lib/api";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deleteAuthor, updateAuthor } from "../actions";
import { AuthorForm } from "../author-form";

// Cache Components (Next 16): async (params + fetch) ДОЛЖНО быть в <Suspense>.
export default function EditAuthorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<EditAuthorSkeleton />}>
      <EditAuthorContent params={params} />
    </Suspense>
  );
}

function EditAuthorSkeleton() {
  return <div className="h-96 animate-pulse rounded-2xl bg-card" />;
}

async function EditAuthorContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await fetchAdminAuthorBySlug(slug);
  if (!data?.author) notFound();
  const author = data.author;

  const updateBound = updateAuthor.bind(null, author.id, author.slug);
  const deleteBound = deleteAuthor.bind(null, author.id);

  return (
    <>
      <header className="mb-6">
        <Link
          href="/authors"
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-mist hover:text-paper"
        >
          <ChevronLeft size={14} strokeWidth={1.75} /> К авторам
        </Link>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="m-0 font-display text-2xl font-extrabold">{author.name}</h1>
            <p className="m-0 mt-1 text-[13px] text-mist">
              {author.role} · <span className="font-mono text-gold">/{author.slug}</span>
            </p>
          </div>
          <form action={deleteBound}>
            <DeleteButton confirmMessage={`Удалить автора "${author.name}" навсегда?`} />
          </form>
        </div>
      </header>

      <div className="max-w-2xl rounded-xl border border-fence bg-card p-6">
        <AuthorForm action={updateBound} defaults={author} submitLabel="Сохранить изменения" />
      </div>
    </>
  );
}
