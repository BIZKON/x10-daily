import { TopBar } from "@/components/top-bar";
import { fetchPartnerCabinet, fetchPartnerProgram } from "@/lib/api";
import type { ApiPartnerCabinet, ApiPartnerDeal, ApiPartnerProgram } from "@/lib/api";
import { BadgeCheck, Check, Copy, HandCoins, Users, Wallet } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { JoinButton } from "./join-button";

export const metadata = { title: "Партнёрам — ИИ работает на вас" };

/**
 * Партнёрская программа в мини-аппе (спека 14.08).
 *
 * Один адрес на два состояния: не участвуешь — читаешь условия и жмёшь кнопку;
 * участвуешь — видишь кабинет. Отдельная страница «спасибо за регистрацию» не
 * нужна: человек и так попадает туда, куда шёл.
 *
 * 🔴 Раздел живёт под настройкой экземпляра. Api отдаёт 404, когда программа
 * выключена, и экран честно говорит, что её здесь нет: завод продаётся копиями,
 * а программа наша.
 */
export default function PartnerPage() {
  return (
    <>
      <TopBar title="Партнёрам" />
      <Suspense fallback={<Skeleton />}>
        <Content />
      </Suspense>
    </>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3 px-4 py-4">
      <div className="h-28 animate-pulse rounded-2xl bg-white/5" />
      <div className="h-40 animate-pulse rounded-2xl bg-white/5" />
    </div>
  );
}

async function Content() {
  // 🔴 PPR-грабля (CLAUDE.md §8): без connection() внутри Suspense-компонента
  // билд запёк бы «раздел недоступен» в статичную оболочку навсегда.
  await connection();

  const cabinet = await fetchPartnerCabinet();
  if (cabinet) return <Cabinet data={cabinet} />;

  const info = await fetchPartnerProgram();
  if (!info) return <Unavailable />;
  return <Offer program={info.program} status={info.status} />;
}

/* ── Приглашение ─────────────────────────────────────────────────────────── */

function Offer({ program, status }: { program: ApiPartnerProgram; status: string | null }) {
  return (
    <div className="px-4 py-4">
      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-red/15 to-gold/10 p-5">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-gold">
          <HandCoins size={14} strokeWidth={2} /> Партнёрская программа
        </div>
        <h1 className="m-0 font-display text-[26px] font-extrabold leading-tight">
          Зарабатывайте от {program.partnerRatePercent}% на рекомендациях
        </h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-white/70">
          Вы рекомендуете систему, которая ведёт контент за команду. Клиент платит — вы получаете
          свою долю с каждой оплаты.
        </p>
      </section>

      <section className="mt-4 space-y-2.5">
        {program.terms.map((t) => (
          <div
            key={t}
            className="flex gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-3.5"
          >
            <Check size={16} strokeWidth={2.5} className="mt-0.5 shrink-0 text-success" />
            <span className="text-[14px] leading-relaxed text-white/85">{t}</span>
          </div>
        ))}
      </section>

      <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="m-0 font-display text-[15px] font-bold">Как это работает</h2>
        <ol className="mt-2.5 space-y-2 pl-5 text-[13.5px] leading-relaxed text-white/70">
          <li>Вы получаете свою страницу с предложением — её и отправляете клиенту.</li>
          <li>Клиент читает, задаёт вопросы вам, договаривается о запуске.</li>
          <li>Мы настраиваем систему и ведём её дальше. Ваша часть — рекомендация.</li>
          <li>Клиент платит — доля приходит вам, здесь же видно сколько и когда.</li>
        </ol>
      </section>

      {status === "paused" ? (
        <p className="mt-4 rounded-xl border border-red/40 bg-red/10 p-3.5 text-[13.5px] text-white/80">
          Ваше участие приостановлено. Напишите нам — разберёмся и вернём доступ.
        </p>
      ) : (
        <div className="mt-5">
          <JoinButton />
          <p className="mt-2 text-center text-[12px] text-white/45">
            Участие бесплатное, обязательств нет
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Кабинет ─────────────────────────────────────────────────────────────── */

const PACKAGE_LABEL: Record<string, string> = { manual: "Ручной режим", line: "Линия" };

const DEAL_STATUS: Record<string, { label: string; tone: string }> = {
  negotiating: { label: "В работе", tone: "text-white/60" },
  awaiting_payment: { label: "Ждёт оплаты", tone: "text-gold" },
  signed: { label: "Оплачивается", tone: "text-success" },
  cancelled: { label: "Отменена", tone: "text-white/35" },
};

const rub = (v: number) =>
  `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(v)} ₽`;

function Cabinet({ data }: { data: ApiPartnerCabinet }) {
  const { partner, balance, deals, invited, payouts } = data;
  const empty = deals.length === 0;

  return (
    <div className="px-4 py-4">
      {/* Сводка сверху: главный вопрос партнёра — сколько мне должны. */}
      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-success/15 to-gold/10 p-5">
        <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-success">
          <Wallet size={14} strokeWidth={2} /> К выплате
        </div>
        <div className="mt-1 font-mono text-[34px] font-extrabold leading-none">
          {rub(balance.dueRub)}
        </div>
        <div className="mt-3 flex gap-5 text-[12.5px] text-white/60">
          <span>
            Начислено <b className="font-mono text-white/85">{rub(balance.accruedRub)}</b>
          </span>
          <span>
            Выплачено <b className="font-mono text-white/85">{rub(balance.paidRub)}</b>
          </span>
        </div>
      </section>

      {partner.kpUrl && (
        <section className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-white/45">
            Ваша страница с предложением
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-gold">
              {partner.kpUrl}
            </code>
            <Copy size={15} strokeWidth={1.75} className="shrink-0 text-white/40" />
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-white/55">
            Отправьте её клиенту. Всё, что он прочитает, подписано вашим именем и вашими контактами.
          </p>
        </section>
      )}

      {/* Онбординг вместо пустого экрана: новичок должен понимать, что делать. */}
      {empty ? (
        <section className="mt-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-5">
          <h2 className="m-0 font-display text-[16px] font-bold">С чего начать</h2>
          <ol className="mt-2.5 space-y-2.5 pl-5 text-[13.5px] leading-relaxed text-white/70">
            <li>Отправьте свою страницу двум-трём знакомым, у кого есть бизнес.</li>
            <li>Не продавайте систему — спросите, кто у них ведёт контент и сколько это стоит.</li>
            <li>Заинтересовались — напишите нам, мы подключимся к разговору.</li>
            <li>Сделка появится здесь, а доля начислится, как только клиент заплатит.</li>
          </ol>
          <p className="mt-3 text-[12.5px] text-white/45">
            {partner.hasMentor
              ? "Вас пригласил партнёр — он тоже заинтересован, чтобы у вас получилось. Спросите его."
              : "Вопросы — пишите нам, отвечаем в тот же день."}
          </p>
        </section>
      ) : (
        <section className="mt-4">
          <h2 className="mb-2 font-display text-[15px] font-bold">Ваши клиенты</h2>
          <div className="space-y-2">
            {deals.map((d) => (
              <DealCard key={d.id} deal={d} />
            ))}
          </div>
        </section>
      )}

      {invited.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-2 flex items-center gap-2 font-display text-[15px] font-bold">
            <Users size={15} strokeWidth={1.75} /> Приведённые партнёры
          </h2>
          <div className="space-y-2">
            {invited.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
              >
                <span className="text-[14px]">{p.name}</span>
                <span className="font-mono text-[13px] text-white/60">продал {rub(p.soldRub)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {payouts.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-2 font-display text-[15px] font-bold">Выплаты</h2>
          <div className="space-y-2">
            {payouts.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
              >
                <span className="text-[13px] text-white/60">
                  {p.paidAt
                    ? new Date(p.paidAt).toLocaleDateString("ru-RU", {
                        day: "2-digit",
                        month: "short",
                      })
                    : "—"}
                  {p.method ? ` · ${p.method}` : ""}
                </span>
                <span className="font-mono text-[14px] font-bold text-success">
                  {rub(p.amountRub)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="mt-6 text-center text-[12px] text-white/35">
        Доля {partner.ratePercent}% приходит с каждой оплаты клиента, а не с суммы договора
      </p>
    </div>
  );
}

function DealCard({ deal }: { deal: ApiPartnerDeal }) {
  const st = DEAL_STATUS[deal.status] ?? DEAL_STATUS.negotiating;
  // Доля считается от ОПЛАЧЕННОГО: показывать процент от суммы договора значило
  // бы обещать деньги, которых ещё нет.
  const earned = Math.round((deal.paidRub * deal.ratePercent) / 100);

  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-display text-[15px] font-bold">{deal.clientName}</div>
          <div className="mt-0.5 text-[12.5px] text-white/50">
            {PACKAGE_LABEL[deal.package] ?? deal.package} · {rub(deal.amountRub)}
          </div>
        </div>
        <span className={`shrink-0 text-[12px] font-semibold ${st?.tone}`}>{st?.label}</span>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5">
        <span className="text-[12.5px] text-white/55">
          Оплачено {rub(deal.paidRub)} из {rub(deal.amountRub)}
        </span>
        <span className="font-mono text-[14px] font-bold text-success">
          {earned > 0 ? `+${rub(earned)}` : "—"}
        </span>
      </div>
    </article>
  );
}

function Unavailable() {
  return (
    <div className="px-4 py-10 text-center">
      <BadgeCheck size={28} strokeWidth={1.5} className="mx-auto mb-3 text-white/25" />
      <p className="mx-auto max-w-[42ch] text-[14px] leading-relaxed text-white/55">
        Партнёрская программа в этом приложении не подключена.
      </p>
    </div>
  );
}
