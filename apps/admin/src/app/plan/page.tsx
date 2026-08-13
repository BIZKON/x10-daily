import { AutoRefresh } from "@/components/auto-refresh";
import { type PlanCalendar, type PlanTopicRow, fetchMyRole, fetchPlan } from "@/lib/api";
import { can } from "@x10/config";
import { AlertCircle, BookOpen, CalendarDays, Check, Loader2, X } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { dropTopic, makeTopic, moveTopic } from "./actions";
import { BuildForm } from "./build-form";

export const metadata = { title: "Контент-план — ProAgent AI Admin" };

/**
 * Контент-план на месяц (спека 13.08, реестр разрыва §3.3).
 *
 * 🔴 Один экран, ДВА РЕЖИМА показа (решение владельца 13.08). Календарь
 * отвечает на вопрос «как распределён месяц», лента — «что это за тема и почему
 * именно она». Первый вопрос задают раз в неделю, второй — каждый раз, когда
 * садятся работать.
 *
 * Оба режима читают ОДИН запрос и рисуют ОДНУ карточку темы: второго источника
 * правды не появляется, расходиться нечему. Раскладку считает сервер.
 *
 * Состояние экрана живёт в адресе (`?view=&range=&anchor=`) — его можно
 * переслать ссылкой, а клиентского состояния не нужно вовсе.
 */
export default function PlanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="h-10 w-72 animate-pulse rounded-xl bg-card" />
      <div className="h-14 animate-pulse rounded-2xl bg-card" />
      <div className="h-72 animate-pulse rounded-2xl bg-card" />
    </div>
  );
}

async function Content({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 🔴 PPR-грабля (CLAUDE.md §8): без `connection()` внутри Suspense-компонента
  // билд запёк бы карточку «недоступно» в статичную оболочку навсегда.
  await connection();
  const params = await searchParams;
  const one = (key: string) => (Array.isArray(params[key]) ? params[key][0] : params[key]);

  const [data, role] = await Promise.all([
    fetchPlan({ view: one("view"), range: one("range"), anchor: one("anchor") }),
    fetchMyRole(),
  ]);
  // Собирать и править план — работа автора: то же право проверяет сервер.
  const canEdit = can(role, "content.edit");

  if (!data) {
    return (
      <section className="rounded-2xl border border-fence bg-card p-8 text-center">
        <h1 className="m-0 mb-2 font-display text-xl font-extrabold">Контент-план недоступен</h1>
        <p className="m-0 text-[14px] leading-relaxed text-mist">
          Сервер не ответил. Темы никуда не делись — обновите страницу через минуту.
        </p>
      </section>
    );
  }

  const building = data.plan?.status === "queued" || data.plan?.status === "running";

  return (
    <div>
      <header className="mb-5">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-gold">
          <CalendarDays size={13} strokeWidth={2} /> Контент-план
        </div>
        <h1 className="m-0 mb-2 font-display text-2xl font-extrabold leading-tight">
          {headline(data)}
        </h1>
        <p className="m-0 max-w-[70ch] text-[14.5px] leading-relaxed text-mist">{subline(data)}</p>
      </header>

      {/* Пустая база знаний — не повод показывать кнопку: план из пустоты это
          тридцать тем про отрасль вообще. Ведём туда, где это чинится. */}
      {data.knowledgeReady === 0 ? (
        <NeedKnowledge />
      ) : (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Switches data={data} />
          {canEdit ? (
            <BuildForm again={data.items.length > 0} />
          ) : (
            <span className="text-[12.5px] text-haze">
              Собирать план может владелец, редактор или автор
            </span>
          )}
        </div>
      )}

      {building && (
        <>
          <AutoRefresh />
          <Building />
        </>
      )}
      {data.plan?.status === "failed" && <Failed reason={data.plan.statusReason} />}

      {data.items.length === 0 && !building ? (
        data.knowledgeReady > 0 && <Empty />
      ) : data.view === "calendar" ? (
        <CalendarView data={data} />
      ) : (
        <DaysView data={data} canEdit={canEdit} />
      )}
    </div>
  );
}

/* ── Состояния ───────────────────────────────────────────────────────────── */

function NeedKnowledge() {
  return (
    <section className="mb-5 rounded-2xl border border-dashed border-fence bg-card p-6">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-gold">
        <BookOpen size={13} strokeWidth={2} /> Сначала база знаний
      </div>
      <p className="m-0 mb-4 max-w-[68ch] text-[14px] leading-relaxed text-mist">
        План собирается из того, что система знает о вашем бизнесе: услуги, цены, возражения, кейсы.
        Пока база пуста, получатся тридцать тем про отрасль вообще — за них будет обидно платить.
        Заполните хотя бы одну полку, это минута, если у вас есть сайт.
      </p>
      <Link
        href="/knowledge"
        className="inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-2.5 text-[13.5px] font-bold text-ink"
      >
        Заполнить базу знаний →
      </Link>
    </section>
  );
}

function Building() {
  return (
    <section className="mb-5 rounded-2xl border border-fence bg-card p-5">
      <div className="flex items-center gap-2.5">
        <Loader2 size={15} className="animate-spin text-gold" />
        <span className="font-display text-[15px] font-bold">Собираем план</span>
      </div>
      <p className="m-0 mt-2.5 text-[13px] leading-relaxed text-mist">
        Обычно занимает около минуты. Можно уйти со страницы и вернуться — план будет ждать здесь.
      </p>
    </section>
  );
}

function Failed({ reason }: { reason: string | null }) {
  return (
    <section className="mb-5 rounded-2xl border border-red/40 bg-red/[0.07] p-5">
      <div className="mb-1.5 flex items-center gap-2 text-[13px] font-bold text-red">
        <AlertCircle size={15} strokeWidth={2} /> Не получилось
      </div>
      <p className="m-0 max-w-[70ch] text-[13.5px] leading-relaxed text-mist">
        {reason ?? "Сборка не удалась. Попробуйте ещё раз."}
      </p>
    </section>
  );
}

function Empty() {
  return (
    <section className="rounded-2xl border border-dashed border-fence bg-card p-8 text-center">
      <h2 className="m-0 mb-2 font-display text-lg font-extrabold">Плана пока нет</h2>
      <p className="m-0 mx-auto max-w-[60ch] text-[14px] leading-relaxed text-mist">
        Нажмите «Собрать план на месяц» — система предложит тридцать тем с датами и форматами,
        опираясь на ваши услуги, цены и возражения. Любую тему можно перенести или убрать.
      </p>
    </section>
  );
}

/* ── Переключатели ───────────────────────────────────────────────────────── */

function Switches({ data }: { data: PlanCalendar }) {
  const href = (view: string, range: string) =>
    `/plan?view=${view}&range=${range}&anchor=${data.anchor}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav className="inline-flex overflow-hidden rounded-xl border border-fence">
        {(["calendar", "days"] as const).map((v) => (
          <Link
            key={v}
            href={href(v, data.range)}
            className={`px-3.5 py-1.5 text-[12.5px] font-semibold ${
              data.view === v ? "bg-gold/[0.14] text-gold" : "text-mist hover:text-paper"
            }`}
          >
            {v === "calendar" ? "Календарь" : "По дням"}
          </Link>
        ))}
      </nav>

      <nav className="inline-flex overflow-hidden rounded-xl border border-fence">
        {(["week", "month"] as const).map((r) => (
          <Link
            key={r}
            href={href(data.view, r)}
            className={`px-3.5 py-1.5 text-[12.5px] font-semibold ${
              data.range === r ? "bg-card-2 text-paper" : "text-mist hover:text-paper"
            }`}
          >
            {r === "week" ? "Неделя" : "Месяц"}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/* ── Режим 1: календарь ──────────────────────────────────────────────────── */

/**
 * Клик по клетке уводит в ленту этого дня, а не открывает свою карточку.
 * Карточка темы в системе одна — так у режимов нет способа разойтись.
 */
function CalendarView({ data }: { data: PlanCalendar }) {
  return data.range === "week" ? <WeekGrid data={data} /> : <MonthGrid data={data} />;
}

function WeekGrid({ data }: { data: PlanCalendar }) {
  const days = data.days ?? [];
  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[900px] gap-1.5"
        style={{ gridTemplateColumns: `58px repeat(${days.length}, minmax(112px, 1fr))` }}
      >
        <div />
        {days.map((d) => (
          <div key={d} className="pb-1 font-mono text-[10.5px] uppercase tracking-wider text-haze">
            {shortDay(d)}
          </div>
        ))}

        {data.slots.map((slot) => (
          <Row key={slot} slot={slot} days={days} data={data} />
        ))}
      </div>
    </div>
  );
}

function Row({ slot, days, data }: { slot: string; days: string[]; data: PlanCalendar }) {
  return (
    <>
      <div className="flex items-center font-mono text-[11px] text-haze">{slot}</div>
      {days.map((day) => {
        const topics = (data.byDate[day] ?? []).filter((t) => t.slot === slot);
        return (
          <div key={`${day}-${slot}`}>
            {topics.length === 0 ? (
              <div className="min-h-[70px] rounded-xl border border-dashed border-fence p-2 font-mono text-[10px] text-haze">
                пусто
              </div>
            ) : (
              topics.map((t) => <Cell key={t.id} topic={t} anchor={day} />)
            )}
          </div>
        );
      })}
    </>
  );
}

function Cell({ topic, anchor }: { topic: PlanTopicRow; anchor: string }) {
  const done = topic.status === "done";
  return (
    <Link
      href={`/plan?view=days&range=week&anchor=${anchor}`}
      className={`block min-h-[70px] rounded-xl border p-2 hover:border-gold/50 ${
        done ? "border-success/30 bg-card" : "border-fence bg-card"
      }`}
    >
      <span className="mb-1 block text-[11.5px] font-bold leading-snug text-paper">
        {topic.title}
      </span>
      <span className="font-mono text-[10px] text-haze">
        {categoryLabel(topic.category)} · {done ? "сделано ✓" : topic.modeSlug}
      </span>
    </Link>
  );
}

function MonthGrid({ data }: { data: PlanCalendar }) {
  const grid = data.grid ?? [];
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[760px] grid-cols-7 gap-1.5">
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
          <div key={d} className="pb-1 font-mono text-[10.5px] uppercase tracking-wider text-haze">
            {d}
          </div>
        ))}

        {grid.map((cell) => {
          const topics = data.byDate[cell.date] ?? [];
          return (
            <Link
              key={cell.date}
              href={`/plan?view=days&range=week&anchor=${cell.date}`}
              className={`flex min-h-[78px] flex-col gap-1 rounded-xl border border-fence bg-card p-2 hover:border-gold/50 ${
                cell.inMonth ? "" : "opacity-35"
              }`}
            >
              <span className="font-mono text-[11px] text-haze">{Number(cell.date.slice(8))}</span>
              {topics.slice(0, 2).map((t) => (
                <span key={t.id} className="text-[11px] leading-tight text-paper">
                  {t.title.length > 34 ? `${t.title.slice(0, 34)}…` : t.title}
                </span>
              ))}
              {topics.length > 2 && (
                <span className="text-[10.5px] text-gold">+{topics.length - 2}</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ── Режим 2: лента по дням ──────────────────────────────────────────────── */

function DaysView({ data, canEdit }: { data: PlanCalendar; canEdit: boolean }) {
  const days = Object.keys(data.byDate).sort();
  if (days.length === 0) return null;

  return (
    <div className="space-y-6">
      {days.map((day) => (
        <section key={day} className="space-y-2.5">
          <div className="flex items-baseline gap-2.5 border-fence border-b pb-1.5">
            <span className="font-display text-[15px] font-extrabold">{longDay(day)}</span>
            <span className="font-mono text-[11.5px] text-haze">{humanDate(day)}</span>
          </div>
          {(data.byDate[day] ?? []).map((topic) => (
            <TopicCard
              key={topic.id}
              topic={topic}
              canEdit={canEdit}
              slots={data.slots}
              bounds={data.bounds}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

/**
 * Карточка темы — одна на оба режима. Текст угла подачи и обоснование видны
 * сразу: именно они отличают план от списка заголовков, и прятать их за кликом
 * значит продать список заголовков.
 */
function TopicCard({
  topic,
  canEdit,
  slots,
  bounds,
}: {
  topic: PlanTopicRow;
  canEdit: boolean;
  slots: string[];
  bounds: { start: string; end: string };
}) {
  const done = topic.status === "done" || Boolean(topic.creationId);

  return (
    <article className="rounded-2xl border border-fence bg-card p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-pill border border-gold/30 bg-gold/[0.1] px-2.5 py-0.5 text-[11px] font-bold text-gold">
          {categoryLabel(topic.category)}
        </span>
        <span className="rounded-pill border border-fence bg-ink px-2.5 py-0.5 text-[11px] font-semibold text-mist">
          {topic.modeSlug}
        </span>
        {topic.slot && <span className="font-mono text-[11px] text-haze">{topic.slot}</span>}
        {done && (
          <span className="rounded-pill border border-success/35 bg-success/[0.08] px-2.5 py-0.5 text-[11px] font-bold text-success">
            Сделано
          </span>
        )}
      </div>

      <h3 className="m-0 mb-2 font-display text-[15.5px] font-bold leading-snug">{topic.title}</h3>
      <p className="m-0 mb-2 text-[13.5px] leading-relaxed text-mist">{topic.angle}</p>

      {topic.rationale && (
        <p className="m-0 mb-3 border-gold/35 border-l-2 pl-2.5 text-[12.5px] leading-relaxed text-mist">
          Почему эта тема: {topic.rationale}
        </p>
      )}

      {canEdit && !done && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MoveForm topic={topic} slots={slots} bounds={bounds} />
          <div className="flex items-center gap-2">
            <form action={dropTopic}>
              <input type="hidden" name="id" value={topic.id} />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg border border-fence px-3 py-1.5 text-[12.5px] font-semibold text-haze hover:text-paper"
              >
                <X size={13} strokeWidth={2} /> Убрать
              </button>
            </form>
            <form action={makeTopic}>
              <input type="hidden" name="id" value={topic.id} />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-gold px-3.5 py-1.5 text-[12.5px] font-bold text-ink"
              >
                <Check size={13} strokeWidth={2.5} /> Сделать
              </button>
            </form>
          </div>
        </div>
      )}

      {done && topic.creationId && (
        <Link href="/create" className="text-[13px] text-gold hover:underline">
          Посмотреть материал →
        </Link>
      )}
    </article>
  );
}

/**
 * Перенос — выбор дня и слота списком, без перетаскивания мышью: мышь на
 * телефоне не работает, а половина одобрений идёт оттуда.
 */
function MoveForm({
  topic,
  slots,
  bounds,
}: {
  topic: PlanTopicRow;
  slots: string[];
  bounds: { start: string; end: string };
}) {
  return (
    <details className="text-[12.5px] text-mist">
      <summary className="cursor-pointer select-none text-gold">Перенести</summary>
      <form action={moveTopic} className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={topic.id} />
        <input
          type="date"
          name="plannedFor"
          defaultValue={topic.plannedFor}
          min={bounds.start}
          className="rounded-lg border border-fence bg-ink px-2.5 py-1.5 font-mono text-[12px] text-paper"
        />
        <select
          name="slot"
          defaultValue={topic.slot ?? ""}
          className="rounded-lg border border-fence bg-ink px-2.5 py-1.5 text-[12px] text-paper"
        >
          <option value="">без времени</option>
          {slots.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg border border-fence bg-card-2 px-3 py-1.5 text-[12px] font-semibold text-paper"
        >
          Перенести
        </button>
      </form>
    </details>
  );
}

/* ── Мелочи ──────────────────────────────────────────────────────────────── */

const CATEGORY_LABELS: Record<string, string> = {
  news: "Новости ИИ",
  cases: "Кейсы",
  howto: "Обучение",
  tools: "Инструменты",
  business: "Практика",
  founder: "От основателя",
};

function categoryLabel(slug: string): string {
  return CATEGORY_LABELS[slug] ?? slug;
}

const WEEKDAYS_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const WEEKDAYS_LONG = [
  "Воскресенье",
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
];
const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

/** Полдень UTC: перевод часов ни в одном поясе не сдвинет дату. */
function at(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12));
}

function shortDay(iso: string): string {
  return `${WEEKDAYS_SHORT[at(iso).getUTCDay()]} ${at(iso).getUTCDate()}`;
}

function longDay(iso: string): string {
  return WEEKDAYS_LONG[at(iso).getUTCDay()] ?? "";
}

function humanDate(iso: string): string {
  const d = at(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function headline(data: PlanCalendar): string {
  if (data.knowledgeReady === 0) return "Контент-план";
  if (data.items.length === 0) return "Контент-план на месяц";
  const done = data.items.filter((i) => i.status === "done").length;
  return done > 0
    ? `${data.items.length} тем · сделано ${done}`
    : `${data.items.length} тем в плане`;
}

function subline(data: PlanCalendar): string {
  if (data.knowledgeReady === 0) {
    return "Система предложит темы, когда узнает о вашем бизнесе.";
  }
  if (data.items.length === 0) {
    return "Тридцать тем с датами и форматами — из ваших услуг, цен и возражений и из того, что сейчас обсуждают в отрасли.";
  }
  return data.view === "calendar"
    ? "Видно, как распределён период: где пусто, а где темы встали подряд. Клик по дню открывает его списком."
    : "У каждой темы виден угол подачи и то, на что она опирается. «Сделать» отправит её обычным путём — через одобрение.";
}
