import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { createAuthor } from "../actions";
import { AuthorForm } from "../author-form";

export const metadata = { title: "Новый автор — ProAgent AI Admin" };

export default function NewAuthorPage() {
  return (
    <>
      <header className="mb-6">
        <Link
          href="/authors"
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-mist hover:text-paper"
        >
          <ChevronLeft size={14} strokeWidth={1.75} /> К авторам
        </Link>
        <h1 className="m-0 font-display text-2xl font-extrabold">Новый автор</h1>
        <p className="m-0 mt-1 text-[13px] text-mist">
          После сохранения откроется страница автора.
        </p>
      </header>

      <div className="max-w-2xl rounded-xl border border-fence bg-card p-6">
        <AuthorForm action={createAuthor} submitLabel="Создать автора" />
      </div>
    </>
  );
}
