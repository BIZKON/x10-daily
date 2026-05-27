import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteButton } from "@/components/form/delete-button";
import { fetchAdminKlampBySlug } from "@/lib/api";
import { deleteKlamp, updateKlamp } from "../actions";
import { KlampForm } from "../klamp-form";

export default async function EditKlampPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const klamp = await fetchAdminKlampBySlug(slug);
  if (!klamp) notFound();

  const updateBound = updateKlamp.bind(null, klamp.id, klamp.slug);
  const deleteBound = deleteKlamp.bind(null, klamp.id);

  return (
    <>
      <header className="mb-6">
        <Link
          href="/klamps"
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-mist hover:text-paper"
        >
          <ChevronLeft size={14} strokeWidth={1.75} /> К клампам
        </Link>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="m-0 font-display text-2xl font-extrabold">{klamp.name}</h1>
            <p className="m-0 mt-1 text-[13px] text-mist">
              {klamp.city} · {klamp.country} · {klamp.memberCount} участников
            </p>
          </div>
          <form action={deleteBound}>
            <DeleteButton confirmMessage={`Удалить кламп "${klamp.name}" навсегда?`} />
          </form>
        </div>
      </header>

      <div className="max-w-2xl rounded-xl border border-fence bg-card p-6">
        <KlampForm action={updateBound} defaults={klamp} submitLabel="Сохранить изменения" />
      </div>
    </>
  );
}
