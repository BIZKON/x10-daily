import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { createEvent } from "../actions";
import { EventForm } from "../event-form";

export const metadata = { title: "Новое событие — X10 Admin" };

export default function NewEventPage() {
  return (
    <>
      <header className="mb-6">
        <Link
          href="/events"
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-mist hover:text-paper"
        >
          <ChevronLeft size={14} strokeWidth={1.75} /> К событиям
        </Link>
        <h1 className="m-0 font-display text-2xl font-extrabold">Новое событие</h1>
      </header>

      <div className="max-w-3xl rounded-xl border border-fence bg-card p-6">
        <EventForm action={createEvent} submitLabel="Создать событие" />
      </div>
    </>
  );
}
