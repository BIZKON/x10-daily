import { type AdminPartner, fetchPartners } from "@/lib/api";
import { HandCoins, Users } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

export const metadata = { title: "Партнёры — ProAgent AI Admin" };

/**
 * Партнёрская программа: список людей и долги перед ними (спека 14.08).
 *
 * Главный вопрос этого экрана — «кому и сколько мы должны», поэтому долг стоит
 * первым столбцом, а не прячется в карточке. Всё остальное — на странице
 * партнёра.
 */
export default function PartnersPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <Content />
    </Suspense>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="h-10 w-64 animate-pulse rounded-xl bg-card" />
      <div className="h-64 animate-pulse rounded-2xl bg-card" />
    </div>
  );
}

const rub = (v: number) =>
  `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(v)} ₽`;

async function Content() {
  // 🔴 PPR-грабля (CLAUDE.md §8): без connection() внутри Suspense-компонента
  // билд запёк бы «данные недоступны» в статичную оболочку навсегда.
  await connection();
  const data = await fetchPartners();

  return (
    <>
      <header className="mb-6 border-b border-fence pb-5">
        <h1 className="m-0 flex items-center gap-2 font-display text-2xl font-extrabold">
          <HandCoins size={22} strokeWidth={1.75} /> Партнёры
        </h1>
        <p className="mt-1.5 max-w-[76ch] text-[13px] leading-relaxed text-mist">
          Кто приводит клиентов и сколько мы им должны. Доля начисляется с каждой поступившей
          оплаты, а не с суммы договора — платим не раньше, чем получили сами.
        </p>
      </header>

      {!data ? (
        <Unavailable />
      ) : data.items.length === 0 ? (
        <Empty />
      ) : (
        <>
          <Totals items={data.items} />
          <div className="space-y-2">
            {data.items.map((p) => (
              <Row key={p.id} p={p} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Totals({ items }: { items: AdminPartner[] }) {
  const due = items.reduce((s, p) => s + p.dueRub, 0);
  const accrued = items.reduce((s, p) => s + p.accruedRub, 0);
  const paid = items.reduce((s, p) => s + p.paidRub, 0);

  return (
    <section className="mb-5 flex flex-wrap gap-6 rounded-2xl border border-fence bg-card p-5">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-haze">
          К выплате
        </div>
        <div className="font-mono text-[26px] font-extrabold text-gold">{rub(due)}</div>
      </div>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-haze">
          Начислено
        </div>
        <div className="font-mono text-[26px] font-bold text-paper">{rub(accrued)}</div>
      </div>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-haze">
          Выплачено
        </div>
        <div className="font-mono text-[26px] font-bold text-mist">{rub(paid)}</div>
      </div>
    </section>
  );
}

function Row({ p }: { p: AdminPartner }) {
  return (
    <Link
      href={`/partners/${p.id}`}
      className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-fence bg-card px-4 py-3.5 transition hover:border-gold/40"
    >
      <span className="min-w-[12rem] flex-1">
        <span className="block font-display text-[15px] font-bold text-paper">{p.name}</span>
        <span className="mt-0.5 block text-[12.5px] text-haze">
          {p.contact ?? "контакт не указан"}
          {p.mentorName ? ` · привёл ${p.mentorName}` : ""}
          {p.status === "paused" ? " · приостановлен" : ""}
        </span>
      </span>
      <span className="text-right">
        <span className="block text-[11px] uppercase tracking-wider text-haze">начислено</span>
        <span className="font-mono text-[14px] text-mist">{rub(p.accruedRub)}</span>
      </span>
      <span className="text-right">
        <span className="block text-[11px] uppercase tracking-wider text-haze">к выплате</span>
        <span
          className={`font-mono text-[15px] font-bold ${p.dueRub > 0 ? "text-gold" : "text-mist"}`}
        >
          {rub(p.dueRub)}
        </span>
      </span>
    </Link>
  );
}

function Empty() {
  return (
    <div className="rounded-2xl border border-dashed border-fence bg-card p-8 text-center">
      <Users size={26} strokeWidth={1.5} className="mx-auto mb-3 text-haze" />
      <h2 className="m-0 mb-2 font-display text-lg font-extrabold">Партнёров пока нет</h2>
      <p className="m-0 mx-auto max-w-[62ch] text-[14px] leading-relaxed text-mist">
        Люди появляются здесь сами: читатель открывает раздел «Партнёрам» в приложении и жмёт «Стать
        партнёром». Заводить руками ничего не нужно.
      </p>
    </div>
  );
}

function Unavailable() {
  return (
    <div className="rounded-2xl border border-red/40 bg-red/5 p-6">
      <h2 className="m-0 font-display text-lg font-extrabold text-red">Данные недоступны</h2>
      <p className="mt-2 text-[14px] text-mist">
        Api не ответил, сессия не установлена или у вашей роли нет права вести партнёров — это может
        только владелец.
      </p>
    </div>
  );
}
