import { AutoRefresh } from "@/components/auto-refresh";
import { type KbImport, type KbProposal, fetchKnowledgeImport, fetchMyRole } from "@/lib/api";
import { can } from "@x10/config";
import { AlertCircle, ArrowLeft, Check, Globe, Loader2, X } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { acceptAllProposals, acceptProposal, rejectProposal } from "../../actions";

export const metadata = { title: "Разбор сайта — ProAgent AI Admin" };

/**
 * Разбор того, что система нашла на сайте клиента.
 *
 * 🔴 ОТДЕЛЬНЫЙ экран, а не список внутри полок (решение владельца 12.08).
 * Полка отвечает на вопрос «что система знает о моём бизнесе», и непринятое
 * предложение сделало бы этот ответ неправдой ровно там, где человек ему
 * верит. Заодно разбор пачкой не требует обойти семь полок по очереди.
 *
 * Группировка по полкам выбрана из трёх вариантов сознательно: цены и описания
 * услуг требуют разного внимания, и полки сами разводят их по разным решениям.
 * В таблице со сплошным «выделить всё» цена уехала бы в базу непрочитанной.
 */
export default function KnowledgeImportPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="h-10 w-72 animate-pulse rounded-xl bg-card" />
      <div className="h-32 animate-pulse rounded-2xl bg-card" />
      <div className="h-52 animate-pulse rounded-2xl bg-card" />
    </div>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  // 🔴 PPR-грабля (CLAUDE.md §8): без `connection()` внутри Suspense-компонента
  // билд запёк бы карточку «недоступно» в статичную оболочку навсегда.
  await connection();
  const { id } = await params;
  // Оба запроса разом: ждать их по очереди значит удвоить ожидание на ровном
  // месте, а роль нужна до первой отрисовки кнопок.
  const [data, role] = await Promise.all([fetchKnowledgeImport(id), fetchMyRole()]);
  /**
   * 🔴 Приёмка меняет базу знаний, поэтому идёт под `catalog.manage` — то же
   * право проверяет сервер. Прятать кнопку — не защита, а честность: кнопка,
   * которая отвечает отказом, читается как поломка системы, а не как отсутствие
   * прав.
   */
  const canManage = can(role, "catalog.manage");

  if (!data) {
    return (
      <section className="rounded-2xl border border-fence bg-card p-8 text-center">
        <h1 className="m-0 mb-2 font-display text-xl font-extrabold">Разбор недоступен</h1>
        <p className="m-0 text-[14px] leading-relaxed text-mist">
          Сервер не ответил. Найденное никуда не делось — обновите страницу через минуту.
        </p>
      </section>
    );
  }

  const { item, documents } = data;

  return (
    <div>
      <Link
        href="/knowledge"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-mist hover:text-paper"
      >
        <ArrowLeft size={14} strokeWidth={2} /> База знаний
      </Link>

      <header className="mb-5">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-gold">
          <Globe size={13} strokeWidth={2} /> Разбор · {hostOf(item.siteUrl)}
        </div>
        <h1 className="m-0 mb-2 font-display text-2xl font-extrabold leading-tight">
          {headline(item, documents.length)}
        </h1>
        <p className="m-0 max-w-[70ch] text-[14.5px] leading-relaxed text-mist">
          {subline(item, documents.length)}
        </p>
      </header>

      {(item.status === "queued" || item.status === "running") && (
        <>
          <AutoRefresh />
          <Progress item={item} />
        </>
      )}
      {item.status === "failed" && <Failure item={item} />}

      {item.notes && item.notes.length > 0 && <Notes notes={item.notes} />}

      {documents.length > 0 && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono text-[12px] text-mist">
              {documents.length} {plural(documents.length, "материал", "материала", "материалов")}{" "}
              на {shelfCount(documents)}{" "}
              {plural(shelfCount(documents), "полке", "полках", "полках")}
            </span>
            {canManage ? (
              <form action={acceptAllProposals}>
                <input type="hidden" name="importId" value={item.id} />
                <button
                  type="submit"
                  className="rounded-xl bg-gold px-4 py-2 text-[13px] font-bold text-ink"
                >
                  Принять всё
                </button>
              </form>
            ) : (
              <span className="text-[12.5px] text-haze">
                Принимать материалы может владелец или редактор
              </span>
            )}
          </div>

          <div className="space-y-6">
            {groupByShelf(documents).map((group) => (
              <ShelfGroup key={group.slug} group={group} importId={item.id} canManage={canManage} />
            ))}
          </div>
        </>
      )}

      {item.status === "ready" && documents.length === 0 && <AllDone />}

      {item.pages && item.pages.length > 0 && <Pages item={item} />}
    </div>
  );
}

/* ── Состояния обхода ────────────────────────────────────────────────────── */

function Progress({ item }: { item: KbImport }) {
  const read = item.pages?.filter((p) => p.status === "read").length ?? 0;
  return (
    <section className="mb-5 rounded-2xl border border-fence bg-card p-5">
      <div className="flex items-center gap-2.5">
        <Loader2 size={15} className="animate-spin text-gold" />
        <span className="font-display text-[15px] font-bold">Читаем сайт</span>
        <span className="ml-auto font-mono text-[12px] text-mist">
          {read > 0 ? `${read} ${plural(read, "страница", "страницы", "страниц")}` : "начинаем"}
        </span>
      </div>
      <p className="m-0 mt-2.5 text-[13px] leading-relaxed text-mist">
        Обычно занимает минуту. Можно уйти со страницы и вернуться — разбор будет ждать здесь.
      </p>
    </section>
  );
}

function Failure({ item }: { item: KbImport }) {
  return (
    <section className="mb-5 rounded-2xl border border-red/40 bg-red/[0.07] p-5">
      <div className="mb-1.5 flex items-center gap-2 text-[13px] font-bold text-red">
        <AlertCircle size={15} strokeWidth={2} /> Не получилось
      </div>
      <p className="m-0 max-w-[70ch] text-[13.5px] leading-relaxed text-mist">
        {item.statusReason ?? "Обход не удался. Попробуйте ещё раз."}
      </p>
      <p className="m-0 mt-3 text-[13px] text-mist">
        Материалы всегда можно добавить руками —{" "}
        <Link href="/knowledge" className="text-gold hover:underline">
          вернуться к полкам
        </Link>
        .
      </p>
    </section>
  );
}

function AllDone() {
  return (
    <section className="rounded-2xl border border-fence bg-card p-8 text-center">
      <h2 className="m-0 mb-2 font-display text-lg font-extrabold">Разбирать нечего</h2>
      <p className="m-0 text-[14px] leading-relaxed text-mist">
        Все предложения разобраны.{" "}
        <Link href="/knowledge" className="text-gold hover:underline">
          Посмотреть полки
        </Link>
        .
      </p>
    </section>
  );
}

/**
 * Чего на сайте не нашлось. Сплошной steel-фон — канон смысловых выносок
 * (CLAUDE.md §5): градиенты в них отвергнуты за читаемость.
 */
function Notes({ notes }: { notes: string[] }) {
  return (
    <section className="mb-5 rounded-2xl bg-steel p-5">
      <div className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-gold">
        Чего на сайте не нашлось
      </div>
      <ul className="m-0 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-[#dfe3e8]">
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <p className="m-0 mt-3 text-[12.5px] leading-relaxed text-[#b9c0c8]">
        Это стоит дописать руками на полках — иначе система просто не станет об этом писать.
      </p>
    </section>
  );
}

/* ── Приёмка по полкам ───────────────────────────────────────────────────── */

type Group = { slug: string; title: string; documents: KbProposal[] };

function ShelfGroup({
  group,
  importId,
  canManage,
}: { group: Group; importId: string; canManage: boolean }) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-fence border-b pb-2">
        <span className="font-display text-[15.5px] font-extrabold">
          {group.title}{" "}
          <span className="font-mono text-[12px] text-haze">· {group.documents.length}</span>
        </span>
      </div>

      <div className="space-y-3">
        {group.documents.map((doc) => (
          <Proposal key={doc.id} doc={doc} importId={importId} canManage={canManage} />
        ))}
      </div>
    </section>
  );
}

function Proposal({
  doc,
  importId,
  canManage,
}: { doc: KbProposal; importId: string; canManage: boolean }) {
  return (
    <article className="rounded-2xl border border-fence bg-card p-5">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <h3 className="m-0 font-display text-[15.5px] font-bold leading-snug">{doc.title}</h3>
        <span className="shrink-0 rounded-pill border border-gold/30 bg-gold/[0.12] px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-gold">
          Предложено
        </span>
      </div>

      {/* Текст целиком: принимают то, что прочитали. Свёрнутое превью на цене
          и сроках означало бы решение вслепую. */}
      <p className="m-0 mb-3 whitespace-pre-wrap text-[13.5px] leading-relaxed text-mist">
        {doc.body}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[11px] text-haze">
          {doc.sourceUrl ? pathOf(doc.sourceUrl) : "источник не указан"} ·{" "}
          {doc.charCount.toLocaleString("ru-RU")} знаков
        </span>

        {canManage && (
          <div className="flex items-center gap-2">
            <form action={rejectProposal}>
              <input type="hidden" name="id" value={doc.id} />
              <input type="hidden" name="importId" value={importId} />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg border border-fence px-3 py-1.5 text-[12.5px] font-semibold text-haze hover:text-paper"
              >
                <X size={13} strokeWidth={2} /> Отклонить
              </button>
            </form>
            <form action={acceptProposal}>
              <input type="hidden" name="id" value={doc.id} />
              <input type="hidden" name="importId" value={importId} />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg border border-success/45 bg-success/[0.08] px-3 py-1.5 text-[12.5px] font-semibold text-success"
              >
                <Check size={13} strokeWidth={2.5} /> Принять
              </button>
            </form>
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * Что именно прочитано и что отсеяно. Отвечает на вопрос «почему система не
 * нашла мои цены» без нашего участия — канон админки: экран объясняет себя сам.
 */
function Pages({ item }: { item: KbImport }) {
  const pages = item.pages ?? [];
  return (
    <details className="mt-6 rounded-2xl border border-fence bg-card p-4 text-[13px] text-mist">
      <summary className="cursor-pointer select-none font-medium text-gold">
        Какие страницы прочитаны ({pages.filter((p) => p.status === "read").length} из{" "}
        {pages.length})
      </summary>
      <ul className="mt-3 space-y-1.5">
        {pages.map((p) => (
          <li key={p.url} className="font-mono text-[11.5px] leading-relaxed">
            <span className={p.status === "read" ? "text-success" : "text-haze"}>
              {p.status === "read" ? "✓" : "—"}
            </span>{" "}
            <span className={p.status === "read" ? "text-mist" : "text-haze"}>{pathOf(p.url)}</span>
            {p.status === "skipped" && p.reason && <span className="text-haze"> — {p.reason}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

/* ── Мелочи ──────────────────────────────────────────────────────────────── */

function groupByShelf(documents: KbProposal[]): Group[] {
  const map = new Map<string, Group & { position: number }>();
  for (const d of documents) {
    let g = map.get(d.shelfSlug);
    if (!g) {
      g = { slug: d.shelfSlug, title: d.shelfTitle, position: d.shelfPosition, documents: [] };
      map.set(d.shelfSlug, g);
    }
    g.documents.push(d);
  }
  return [...map.values()].sort((a, b) => a.position - b.position);
}

function shelfCount(documents: KbProposal[]): number {
  return new Set(documents.map((d) => d.shelfSlug)).size;
}

function headline(item: KbImport, found: number): string {
  if (item.status === "queued" || item.status === "running") return "Читаем ваш сайт";
  if (item.status === "failed") return "Сайт прочитать не удалось";
  if (found === 0) return "Разбор закончен";
  return `Нашли ${found} ${plural(found, "материал", "материала", "материалов")}`;
}

function subline(item: KbImport, found: number): string {
  if (item.status === "queued" || item.status === "running") {
    return "Система читает страницы и раскладывает найденное по полкам. Ничего не попадёт в работу, пока вы не примете.";
  }
  if (item.status === "failed") return "Ниже — что именно пошло не так.";
  if (found === 0) return "Новых предложений нет.";
  return "Пока вы не приняли материал, система его не использует. Смотрите по полкам: цены и описания услуг стоит читать внимательнее прочего.";
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? "/ (главная)" : u.pathname;
  } catch {
    return url;
  }
}
