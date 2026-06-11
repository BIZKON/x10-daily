import { DeleteButton } from "@/components/form/delete-button";
import { fetchAdminEventBySlug } from "@/lib/api";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deleteEvent, updateEvent } from "../actions";
import { EventForm } from "../event-form";

// Cache Components (Next 16): async (params + fetch) ДОЛЖНО быть в <Suspense>.
export default function EditEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<EditEventSkeleton />}>
      <EditEventContent params={params} />
    </Suspense>
  );
}

function EditEventSkeleton() {
  return <div className="h-96 animate-pulse rounded-2xl bg-card" />;
}

async function EditEventContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await fetchAdminEventBySlug(slug);
  if (!event) notFound();

  const updateBound = updateEvent.bind(null, event.id, event.slug);
  const deleteBound = deleteEvent.bind(null, event.id);

  return (
    <>
      <header className="mb-6">
        <Link
          href="/events"
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-mist hover:text-paper"
        >
          <ChevronLeft size={14} strokeWidth={1.75} /> К событиям
        </Link>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="m-0 font-display text-2xl font-extrabold">{event.title}</h1>
            <p className="m-0 mt-1 text-[13px] text-mist">
              {event.type} · {new Date(event.startDate).toLocaleString("ru-RU")} · {event.organizer}
            </p>
          </div>
          <form action={deleteBound}>
            <DeleteButton confirmMessage={`Удалить событие "${event.title}" навсегда?`} />
          </form>
        </div>
      </header>

      <div className="max-w-3xl rounded-xl border border-fence bg-card p-6">
        <EventForm action={updateBound} defaults={event} submitLabel="Сохранить изменения" />
      </div>
    </>
  );
}
