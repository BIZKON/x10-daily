import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { createDigest } from "../actions";
import { DigestForm } from "../digest-form";

export const metadata = { title: "Новый дайджест — ProAgent AI Admin" };

export default function NewDigestPage() {
  return (
    <>
      <header className="mb-6">
        <Link
          href="/digests"
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-mist hover:text-paper"
        >
          <ChevronLeft size={14} strokeWidth={1.75} /> К дайджестам
        </Link>
        <h1 className="m-0 font-display text-2xl font-extrabold">Новый дайджест</h1>
        <p className="m-0 mt-1 text-[13px] text-mist">
          Утренний выпуск. NewsletterAssembleAgent может сгенерировать черновик — редактор финалит.
        </p>
      </header>

      <div className="max-w-3xl rounded-xl border border-fence bg-card p-6">
        <DigestForm action={createDigest} submitLabel="Создать дайджест" />
      </div>
    </>
  );
}
