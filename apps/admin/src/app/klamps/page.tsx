import { fetchAdminKlamps } from "@/lib/api";
import { MapPin, Plus, Users } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

// Cache Components (Next 16): async fetch ДОЛЖЕН быть внутри <Suspense>.
export default function KlampsPage() {
  return (
    <Suspense fallback={<KlampsSkeleton />}>
      <KlampsContent />
    </Suspense>
  );
}

function KlampsSkeleton() {
  return <div className="h-72 animate-pulse rounded-2xl bg-card" />;
}

async function KlampsContent() {
  const data = await fetchAdminKlamps();
  const total = data?.items.reduce((acc, k) => acc + k.memberCount, 0) ?? 0;

  return (
    <>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="m-0 font-display text-2xl font-extrabold">Клампы</h1>
          <p className="m-0 mt-1 text-[13px] text-mist">
            Сообщество Х10: {data?.items.length ?? 0} клампов ·{" "}
            <strong className="text-paper">{total.toLocaleString("ru-RU")}</strong> участников
          </p>
        </div>
        <Link
          href="/klamps/new"
          className="flex items-center gap-1.5 rounded-lg bg-red px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-red-deep"
        >
          <Plus size={14} strokeWidth={2} /> Создать
        </Link>
      </header>

      {!data ? (
        <ApiUnavailable />
      ) : data.items.length === 0 ? (
        <EmptyState message="Ещё нет клампов." />
      ) : (
        <div className="grid gap-3">
          {data.items.map((k) => (
            <Link
              key={k.id}
              href={`/klamps/${k.slug}`}
              className="block rounded-xl border border-fence bg-card p-4 transition hover:border-gold/40"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="m-0 font-display text-[15px] font-extrabold">{k.name}</h3>
                    {k.isOpen ? (
                      <span className="rounded-pill border border-success/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success">
                        принимает
                      </span>
                    ) : (
                      <span className="rounded-pill border border-fence px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-haze">
                        закрыт
                      </span>
                    )}
                  </div>
                  <p className="m-0 mt-1 flex items-center gap-1.5 text-[12px] text-mist">
                    <MapPin size={12} strokeWidth={1.75} /> {k.city}, {k.country} · {k.leadName}
                  </p>
                  {k.goal && <p className="m-0 mt-2 text-[12.5px] text-mist">🎯 {k.goal}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <div className="flex items-center gap-1 text-[15px] font-extrabold text-gold">
                    <Users size={13} strokeWidth={2} /> {k.memberCount}
                  </div>
                  <div className="mt-1 text-[10px] text-haze">{k.meetingSchedule}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
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
