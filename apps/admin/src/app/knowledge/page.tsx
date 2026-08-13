import { AutoRefresh } from "@/components/auto-refresh";
import {
  type KbImport,
  type KbShelf,
  fetchKnowledge,
  fetchLatestKnowledgeImport,
  fetchMyRole,
} from "@/lib/api";
import { can } from "@x10/config";
import { BookOpen, Check, ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AnswerForm } from "./answer-form";
import { ImportForm } from "./import-form";

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
  // 🔴 PPR-грабля (CLAUDE.md §8). На билде `X10_API_BASE_URL` не задан, поэтому
  // `fetchKnowledge` возвращает null, НЕ дотянувшись до cookies. Динамической
  // дыры не возникает, и Next запекает «База знаний недоступна» в статичную
  // оболочку навсегда: сервер отдаёт карточку ошибки, клиент потом дорисовывает
  // настоящее дерево, а React ругается на несовпадение разметки.
  // `connection()` ВНУТРИ Suspense-компонента форсирует дыру.
  await connection();
  // Оба запроса разом: последний обход нужен обоим режимам экрана, а ждать их
  // по очереди значит удвоить ожидание на ровном месте.
  const [data, lastImport, role] = await Promise.all([
    fetchKnowledge(),
    fetchLatestKnowledgeImport(),
    fetchMyRole(),
  ]);
  /**
   * 🔴 Наполнение базы знаний идёт под `catalog.manage` — то же право проверяет
   * сервер. Наблюдателю знание о бизнесе видеть можно, менять нельзя, и форма,
   * которая отвечает отказом, читалась бы как поломка, а не как отсутствие прав.
   */
  const canManage = can(role, "catalog.manage");

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
    <Survey shelves={items} lastImport={lastImport} canManage={canManage} />
  ) : (
    <Shelves
      shelves={items}
      filled={progress.filled}
      required={progress.required}
      lastImport={lastImport}
      canManage={canManage}
    />
  );
}

/**
 * Обход, который уже был: идёт, ждёт разбора или отказал.
 *
 * Показываем в обоих режимах экрана. Молчать о непринятых предложениях нельзя:
 * человек заплатил за обход, а найденное не работает, пока он его не принял.
 */
function ImportState({ item }: { item: KbImport }) {
  if (item.status === "queued" || item.status === "running") {
    return (
      <>
        <AutoRefresh />
        <Link
          href={`/knowledge/import/${item.id}`}
          className="mb-4 flex items-center gap-2.5 rounded-2xl border border-fence bg-card p-4 hover:border-gold/50"
        >
          <Loader2 size={15} className="animate-spin text-gold" />
          <span className="text-[13.5px] text-paper">Читаем ваш сайт</span>
          <span className="ml-auto text-[13px] text-gold">Посмотреть ход →</span>
        </Link>
      </>
    );
  }

  if (item.status === "ready" && item.proposed > 0) {
    return (
      <Link
        href={`/knowledge/import/${item.id}`}
        className="mb-4 flex flex-wrap items-center gap-2.5 rounded-2xl border border-gold/35 bg-gold/[0.07] p-4 hover:border-gold"
      >
        <span className="text-[13.5px] text-paper">
          С сайта найдено {item.proposed}{" "}
          {item.proposed === 1 ? "материал" : item.proposed < 5 ? "материала" : "материалов"} — ждут
          вашего решения
        </span>
        <span className="ml-auto text-[13px] font-semibold text-gold">Разобрать →</span>
      </Link>
    );
  }

  if (item.status === "failed") {
    return (
      <Link
        href={`/knowledge/import/${item.id}`}
        className="mb-4 flex flex-wrap items-center gap-2.5 rounded-2xl border border-red/35 bg-red/[0.06] p-4 hover:border-red"
      >
        <span className="text-[13.5px] text-mist">
          {item.statusReason ?? "Обход сайта не удался."}
        </span>
        <span className="ml-auto text-[13px] text-gold">Подробнее →</span>
      </Link>
    );
  }

  return null;
}

/* ── Режим 1: анкета ─────────────────────────────────────────────────────── */

/**
 * Пока система про клиента ничего не знает, экран спрашивает, а не показывает
 * пустую форму загрузки. Вопросы лежат в самих полках (`kb_shelves.question`),
 * поэтому анкета — это другое представление тех же данных, а не вторая труба.
 */
function Survey({
  shelves,
  lastImport,
  canManage,
}: { shelves: KbShelf[]; lastImport: KbImport | null; canManage: boolean }) {
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
          система будет писать, зная это, и вам не придётся объяснять одно и то же в каждом запросе.
          Можно прерваться и вернуться: ответы сохраняются по одному.
        </p>
      </header>

      <Progress done={done} total={required.length} />

      {lastImport && <ImportState item={lastImport} />}

      {/* 🔴 Кнопка стоит ВЫШЕ вопросов, а не под ними. Час в анкете — та самая
          причина, по которой на проде лежал один материал: до конца опроса не
          доходят. Пусть первым предложением будет «возьмите с моего сайта». */}
      {canManage && (
        <div className="mb-5">
          <ImportForm />
        </div>
      )}

      <div className="space-y-3">
        {shelves.map((s, i) => (
          <Question key={s.id} shelf={s} index={i + 1} canManage={canManage} />
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

function Question({
  shelf,
  index,
  canManage,
}: { shelf: KbShelf; index: number; canManage: boolean }) {
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
            {shelf.documents === 1 ? "материал" : shelf.documents < 5 ? "материала" : "материалов"}{" "}
            · посмотреть и дополнить
            <ChevronRight size={14} strokeWidth={2} />
          </Link>
        ) : canManage ? (
          <AnswerForm slug={shelf.slug} fallbackTitle={shelf.title} />
        ) : (
          <span className="text-[13px] text-haze">
            Пока пусто. Заполнить может владелец или редактор
          </span>
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
  lastImport,
  canManage,
}: {
  shelves: KbShelf[];
  filled: number;
  required: number;
  lastImport: KbImport | null;
  canManage: boolean;
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

      {lastImport && <ImportState item={lastImport} />}

      {canManage && (
        <div className="mb-5">
          <ImportForm />
        </div>
      )}

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
      <p className="m-0 mb-4 min-h-[3.2em] text-[13px] leading-relaxed text-mist">
        {shelf.purpose}
      </p>

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
