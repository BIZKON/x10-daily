import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { createKlamp } from "../actions";
import { KlampForm } from "../klamp-form";

export const metadata = { title: "Новый кламп — X10 Admin" };

export default function NewKlampPage() {
  return (
    <>
      <header className="mb-6">
        <Link
          href="/klamps"
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-mist hover:text-paper"
        >
          <ChevronLeft size={14} strokeWidth={1.75} /> К клампам
        </Link>
        <h1 className="m-0 font-display text-2xl font-extrabold">Новый кламп</h1>
      </header>

      <div className="max-w-2xl rounded-xl border border-fence bg-card p-6">
        <KlampForm action={createKlamp} submitLabel="Создать кламп" />
      </div>
    </>
  );
}
