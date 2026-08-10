import { type KbShelf, fetchKnowledge } from "@/lib/api";
import { BookOpen, Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AnswerForm } from "./answer-form";

export const metadata = { title: "База знаний — ProAgent AI Admin" };

/**
 * База знаний клиента — раздел, из которого система узнаёт о его бизнесе.
 *
 * 🔴 Один экран, два режима, и переключает их СЕРВЕР (поле `progress.mode`).
 * Пока не заполнена ни одна обязательная полка — анкета: пустая картотека
 * ничего не объясняет и читается как поломка. Как только знание появилось —
 * полки: вернувшийся клиент хочет докинуть материал, а не проходить опрос
 * заново.
 *
 * Считать «пусто ли» в вёрстке нельзя: тогда сервер и экран разъедутся, и
 * человек будет попадать то в анкету, то в полки без понятной причины.
 *
 * Cache Components (Next 16): асинхронные данные обязаны быть внутри Suspense,
 * иначе билд падает «Uncached data accessed outside of Suspense». Поэтому
 * страница-обёртка синхронная.
 */
export default function KnowledgePage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <Content />
    </Suspense>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="h-10 w-64 animate-pulse rounded-xl bg-card" />
      <div className="h-52 animate-pulse rounded-2xl bg-card" />
      <div className="h-52 animate-pulse rounded-2xl bg-card" />
    </div>
  );
}

async function Content() {
  const data = await fetchKnowledge();

  if (!data) {
    return (
      <section className="rounded-2xl border border-fence bg-card p-8 text-center">
        <h1 className="m-0 mb-2 font-display text-xl font-extrabold">База знаний недоступна</h1>
        <p className="m-0 text-[14px] leading-relaxed text-mist">
          Сервер не ответил. Материалы никуда не делись — обновите страницу через минуту.
        </p>
      </section>
    );
  }

  const { items, progress } = data;
  return progress.mode === "survey" ? (
    <Survey shelves={items} />
  ) : (
    <Shelves shelves={items} filled={progress.filled} required={progress.required} />
  );
}

/* ── Режим 1: анкета ─────────────────────────────────────────────────────── */

/**
 * Пока система про клиента ничего не знает, экран спрашивает, а не показывает
 * пустую форму загрузки. Вопросы лежат в самих полках (`kb_shelves.question`),
 * поэтому анкета — это другое представление тех же данных, а не вторая труба.
 */
function Survey({ shelves }: { shelves: KbShelf[] }) {
  const required = shelves.filter((s) => s.required);
  const done = required.filter((s) => s.documents > 0).length;

  return (
    <div>
      <header className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-gold">
          <BookOpen size={13} strokeWidth={2} /> База знаний
        </div>
        <h1 className="m-0 mb-2 font-display text-2xl font-extrabold leading-tight">
          Расскажите системе о вашем бизнесе
        </h1>
        <p className="m-0 max-w-[70ch] text-[14.5px] leading-relaxed text-mist">
          Ответьте своими словами — как рассказали бы новому сотруднику в первый день. Дальше
          система будет писать, зная это, и вам не придётся объяснять одно и то же в каждом
          запросе. Можно прерваться и вернуться: ответы сохраняются по одному.
        </p>
      </header>

      <Progress done={done} total={required.length} />

      <div className="space-y-3">
        {shelves.map((s, i) => (
          <Question key={s.id} shelf={s} index={i + 1} />
        ))}
      </div>

      <Why />
    </div>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-fence">
        <div className="h-full rounded-pill bg-gold transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="shrink-0 font-mono text-[12px] text-mist">
        {done} из {total}
      </span>
    </div>
  );
}

function Question({ shelf, index }: { shelf: KbShelf; index: number }) {
  const answered = shelf.documents > 0;
  return (
    <section
      className={`rounded-2xl border p-5 ${
        answered ? "border-success/35 bg-success/[0.06]" : "border-fence bg-card"
      }`}
    >
      <div className="mb-1.5 flex items-center gap-2.5">
        <span
          className={`grid size-6 shrink-0 place-items-center rounded-lg font-mono text-[11px] font-bold ${
            answered ? "bg-success text-ink" : "bg-fence text-mist"
          }`}
        >
          {answered ? <Check size={13} strokeWidth={3} /> : index}
        </span>
        <h2 className="m-0 font-display text-[16px] font-bold leading-snug">{shelf.question}</h2>
        {!shelf.required && (
          <span className="ml-auto shrink-0 font-mono text-[10.5px] uppercase tracking-wider text-haze">
            можно пропустить
          </span>
        )}
      </div>

      {shelf.hint && (
        <p className="m-0 mb-3 pl-[34px] text-[13px] leading-relaxed text-mist">{shelf.hint}</p>
      )}

      <div className="pl-[34px]">
        {answered ? (
          <Link
            href={`/knowledge/${shelf.slug}`}
            className="inline-flex items-center gap-1.5 text-[13px] text-gold hover:underline"
          >
            {shelf.documents}{" "}
            {shelf.documents === 1 ? "материал" : shelf.documents < 5 ? "материала" : "материалов"} ·
            посмотреть и дополнить
            <ChevronRight size={14} strokeWidth={2} />
          </Link>
        ) : (
          <AnswerForm slug={shelf.slug} fallbackTitle={shelf.title} />
        )}
      </div>
    </section>
  );
}

/* ── Режим 2: полки ──────────────────────────────────────────────────────── */

/**
 * Наполненность показываем числом материалов и полосой, а не процентом
 * «готовности»: процент пришлось бы выдумывать, а число проверяемо.
 */
function Shelves({
  shelves,
  filled,
  required,
}: {
  shelves: KbShelf[];
  filled: number;
  required: number;
}) {
  return (
    <div>
      <header className="mb-5">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-gold">
          <BookOpen size={13} strokeWidth={2} /> База знаний
        </div>
        <h1 className="m-0 mb-2 font-display text-2xl font-extrabold leading-tight">
          Что система знает о вашем бизнесе
        </h1>
        <p className="m-0 max-w-[70ch] text-[14.5px] leading-relaxed text-mist">
          Чем полнее полки, тем точнее материалы. Пустые видно сразу — начните с них: именно из-за
          них система пишет общими словами вместо ваших.
        </p>
      </header>

      <Progress done={filled} total={required} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shelves.map((s) => (
          <ShelfCard key={s.id} shelf={s} />
        ))}
      </div>

      <Why />
    </div>
  );
}

function ShelfCard({ shelf }: { shelf: KbShelf }) {
  const empty = shelf.documents === 0;
  return (
    <Link
      href={`/knowledge/${shelf.slug}`}
      className={`block rounded-2xl border p-5 transition-colors ${
        empty
          ? "border-dashed border-fence bg-card hover:border-red/50"
          : "border-fence bg-card hover:border-gold/50"
      }`}
    >
      <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-haze">
        {empty ? (shelf.required ? "Полка пуста" : "Не заполнено") : "Полка"}
      </div>
      <h2 className="m-0 mb-2 font-display text-[16.5px] font-bold leading-snug">{shelf.title}</h2>
      <p className="m-0 mb-4 min-h-[3.2em] text-[13px] leading-relaxed text-mist">{shelf.purpose}</p>

      <div className="mb-2 h-1 overflow-hidden rounded-pill bg-fence">
        <div
          className={`h-full rounded-pill ${empty ? "" : "bg-success"}`}
          style={{ width: empty ? "0%" : "100%" }}
        />
      </div>
      <div
        className={`font-mono text-[11.5px] ${empty && shelf.required ? "text-red" : "text-haze"}`}
      >
        {empty
          ? shelf.required
            ? "Не заполнено"
            : "Пусто — необязательно"
          : `${shelf.documents} ${shelf.documents === 1 ? "материал" : shelf.documents < 5 ? "материала" : "материалов"} · ${shelf.chars.toLocaleString("ru-RU")} знаков`}
      </div>
    </Link>
  );
}

/**
 * «Зачем это» — канон админки: клиент не читает наши доки и не может спросить
 * разработчика, значит экран обязан объяснить себя сам.
 */
function Why() {
  return (
    <details className="mt-6 rounded-2xl border border-fence bg-card p-4 text-[13px] text-mist">
      <summary className="cursor-pointer select-none font-medium text-gold">
        Зачем нужна база знаний
      </summary>
      <div className="mt-3 space-y-3 leading-relaxed">
        <p className="m-0">
          Обычный чат с ИИ ничего о вас не помнит: каждый новый разговор начинается с нуля, и
          контекст приходится пересказывать заново. Отсюда общие тексты, которые подошли бы любой
          компании вашей отрасли.
        </p>
        <p className="m-0">
          База знаний переносит эти сведения из запроса в саму систему. Когда конвейер пишет
          материал или вы просите что-то создать, нужные полки подставляются автоматически.
          Заполненная полка «Цены» означает, что система возьмёт вашу цифру, а не придумает
          правдоподобную; заполненные «Возражения» — что материалы будут снимать реальные сомнения
          ваших клиентов, а не выдуманные.
        </p>
        <p className="m-0">
          Полки можно наполнять постепенно. Если чего-то нет, система просто не станет об этом
          писать — это лучше, чем догадка.
        </p>
      </div>
    </details>
  );
}
