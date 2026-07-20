import { type AdminEvent, fetchAdminEvents } from "@/lib/api";
import { Calendar, MapPin, Plus, Ticket, Users } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

// Ключ "kod-x10" — мёртвое значение PG-enum (X10-наследие), из UI не создаётся.
const TYPE_LABEL: Record<AdminEvent["type"], string> = {
  "kod-x10": "Конференция",
  "meet-up": "Meet Up",
  breakfast: "Завтрак",
  festival: "Фестиваль",
  webinar: "Вебинар",
};

const TYPE_COLOR: Record<AdminEvent["type"], string> = {
  "kod-x10": "text-red",
  "meet-up": "text-red",
  festival: "text-gold",
  webinar: "text-gold",
  breakfast: "text-mist",
};

// Cache Components (Next 16): async fetch ДОЛЖЕН быть внутри <Suspense>.
export default function EventsPage() {
  return (
    <Suspense fallback={<EventsSkeleton />}>
      <EventsContent />
    </Suspense>
  );
}

function EventsSkeleton() {
  return <div className="h-72 animate-pulse rounded-2xl bg-card" />;
}

async function EventsContent() {
  const data = await fetchAdminEvents("all");
  // Ранний возврат ДО Date.now: на билде data===null (фейк fetch без реального
  // HTTP), Cache Components считает что uncached data не была прочитана → Date.now
  // запекался бы во время сборки. Этот guard выводит Date.now в недостижимую
  // на билде ветку. В рантайме (data есть) — поведение прежнее.
  if (!data) {
    return (
      <>
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="m-0 font-display text-2xl font-extrabold">События</h1>
            <p className="m-0 mt-1 text-[13px] text-mist">apps/api недоступен</p>
          </div>
          <Link
            href="/events/new"
            className="flex items-center gap-1.5 rounded-lg bg-red px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-red-deep"
          >
            <Plus size={14} strokeWidth={2} /> Создать
          </Link>
        </header>
        <ApiUnavailable />
      </>
    );
  }
  const now = Date.now();
  const upcoming = data.items.filter((e) => new Date(e.startDate).getTime() >= now);
  const past = data.items.filter((e) => new Date(e.startDate).getTime() < now);

  return (
    <>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="m-0 font-display text-2xl font-extrabold">События</h1>
          <p className="m-0 mt-1 text-[13px] text-mist">
            {upcoming.length} предстоящих · {past.length} прошедших
          </p>
        </div>
        <Link
          href="/events/new"
          className="flex items-center gap-1.5 rounded-lg bg-red px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-red-deep"
        >
          <Plus size={14} strokeWidth={2} /> Создать
        </Link>
      </header>

      {data.items.length === 0 ? (
        <EmptyState message="Ещё нет событий." />
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 font-display text-[15px] font-extrabold text-gold">
                Предстоящие
              </h2>
              <div className="grid gap-3">
                {upcoming.map((e) => (
                  <EventRow key={e.id} event={e} />
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-[15px] font-extrabold text-haze">Прошедшие</h2>
              <div className="grid gap-3 opacity-70">
                {past.map((e) => (
                  <EventRow key={e.id} event={e} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}

function EventRow({ event }: { event: AdminEvent }) {
  const start = new Date(event.startDate);
  const dateStr = start.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Link
      href={`/events/${event.slug}`}
      className="block rounded-xl border border-fence bg-card p-4 transition hover:border-gold/40"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <span
              className={`text-[10px] font-extrabold uppercase tracking-[0.15em] ${TYPE_COLOR[event.type]}`}
            >
              {TYPE_LABEL[event.type]}
            </span>
            {event.isOnline && (
              <span className="rounded-pill border border-success/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">
                online
              </span>
            )}
          </div>
          <h3 className="m-0 font-display text-[15px] font-extrabold">{event.title}</h3>
          <p className="m-0 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-mist">
            <span className="flex items-center gap-1">
              <Calendar size={12} strokeWidth={1.75} /> {dateStr}
            </span>
            {event.city && (
              <span className="flex items-center gap-1">
                <MapPin size={12} strokeWidth={1.75} /> {event.city}
              </span>
            )}
            <span>· {event.organizer}</span>
          </p>
        </div>
        <div className="shrink-0 text-right text-[11px] text-haze">
          <div className="flex items-center justify-end gap-1 font-extrabold text-paper">
            <Users size={12} strokeWidth={2} /> {event.registeredCount}
            {event.capacity ? ` / ${event.capacity}` : ""}
          </div>
          {event.ticketPriceFrom !== null ? (
            <div className="mt-1 flex items-center justify-end gap-1 text-gold">
              <Ticket size={11} strokeWidth={2} /> от{" "}
              {event.ticketPriceFrom.toLocaleString("ru-RU")} ₽
            </div>
          ) : (
            <div className="mt-1 text-success">бесплатно</div>
          )}
        </div>
      </div>
    </Link>
  );
}

function ApiUnavailable() {
  return (
    <div className="rounded-xl border border-red/40 bg-red/[0.04] p-5 text-[13px]">
      <strong className="text-red">apps/api недоступен.</strong> Задай{" "}
      <code className="font-mono text-mist">X10_API_BASE_URL</code> в{" "}
      <code className="font-mono text-mist">apps/admin/.env.local</code>.
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-fence bg-card p-8 text-center text-[13px] text-mist">
      {message}
    </div>
  );
}
