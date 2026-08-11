import { type CreationJob, fetchCreationModes, fetchCreations, fetchKnowledge } from "@/lib/api";
import { CheckCircle2, CircleDashed, Loader2, TriangleAlert } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { AutoRefresh } from "./auto-refresh";
import { CreateForm } from "./create-form";

export const metadata = { title: "Создать — ProAgent AI Admin" };

/**
 * Раздел «Создать» — ручной режим (реестр разрыва §3.2).
 *
 * Человек выбирает, ЧТО создаём, коротко говорит, О ЧЁМ, и получает материал.
 * Разница с чатом ровно здесь: в чате нужно описать задачу целиком, а тут
 * «как делается правильно» уже прописано внутри режима.
 *
 * Cache Components (Next 16): асинхронные данные обязаны быть внутри Suspense,
 * иначе билд падает «Uncached data accessed outside of Suspense». Поэтому
 * страница-обёртка синхронная.
 */
export default function CreatePage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <Content />
    </Suspense>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="h-10 w-52 animate-pulse rounded-xl bg-card" />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-36 animate-pulse rounded-2xl bg-card" />
        <div className="h-36 animate-pulse rounded-2xl bg-card" />
        <div className="h-36 animate-pulse rounded-2xl bg-card" />
      </div>
      <div className="h-44 animate-pulse rounded-2xl bg-card" />
    </div>
  );
}

async function Content() {
  // 🔴 PPR-грабля (CLAUDE.md §8). На билде `X10_API_BASE_URL` не задан, запросы
  // возвращают null, НЕ дотянувшись до cookies. Динамической дыры не возникает,
  // и Next запекает «Раздел недоступен» в статичную оболочку навсегда.
  // `connection()` ВНУТРИ Suspense-компонента форсирует дыру.
  await connection();

  const [modes, jobs, knowledge] = await Promise.all([
    fetchCreationModes(),
    fetchCreations(),
    // Названия полок — только ради подсказки «что уйдёт в работу». Отказ этого
    // запроса не должен ронять экран: подсказка обеднеет, раздел останется.
    fetchKnowledge(),
  ]);

  if (!modes) {
    return (
      <section className="rounded-2xl border border-fence bg-card p-8 text-center">
        <h1 className="m-0 mb-2 font-display text-xl font-extrabold">Раздел недоступен</h1>
        <p className="m-0 text-[14px] leading-relaxed text-mist">
          Сервер не ответил. Задания никуда не делись — обновите страницу через минуту.
        </p>
      </section>
    );
  }

  const shelfTitles = Object.fromEntries(
    (knowledge?.items ?? []).map((s) => [s.slug, s.title]),
  ) as Record<string, string>;

  const items = jobs ?? [];
  const working = items.some((j) => j.status === "queued" || j.status === "running");

  return (
    <div>
      {working && <AutoRefresh />}

      <h1 className="m-0 mb-1.5 font-display text-[23px] font-extrabold">Создать</h1>
      <p className="m-0 mb-5 max-w-[640px] text-[13.5px] leading-relaxed text-mist">
        Выберите, что делаем, и коротко скажите о чём. Как делается правильно — уже прописано внутри
        режима, вам остаётся тема.
      </p>

      <CreateForm modes={modes} shelfTitles={shelfTitles} />

      <section className="mt-6">
        <h2 className="m-0 mb-3 font-display text-[14px] font-extrabold text-mist">
          Последние задания
        </h2>
        {items.length === 0 ? (
          <p className="m-0 rounded-2xl border border-fence bg-card p-5 text-[13px] text-haze">
            Пока ничего не создавали. Первое задание появится здесь сразу после отправки.
          </p>
        ) : (
          <ul className="m-0 list-none space-y-2 p-0">
            {items.map((j) => (
              <JobRow key={j.id} job={j} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Подпись состояния — по-русски и без жаргона: её читает сотрудник клиента. */
const STATUS_LABEL: Record<CreationJob["status"], string> = {
  queued: "В очереди",
  running: "Выполняется",
  ready: "Готово",
  failed: "Не выполнено",
};

function StatusMark({ status }: { status: CreationJob["status"] }) {
  if (status === "ready")
    return <CheckCircle2 size={15} strokeWidth={1.75} className="text-success" />;
  if (status === "failed")
    return <TriangleAlert size={15} strokeWidth={1.75} className="text-red" />;
  if (status === "running")
    return <Loader2 size={15} strokeWidth={1.75} className="animate-spin text-gold" />;
  return <CircleDashed size={15} strokeWidth={1.75} className="text-haze" />;
}

function JobRow({ job }: { job: CreationJob }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-fence bg-card px-4 py-3">
      <StatusMark status={job.status} />

      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[13px] font-semibold text-paper">{job.prompt}</p>
        <p className="m-0 mt-0.5 text-[11.5px] text-haze">
          {STATUS_LABEL[job.status]}
          {/* Причина отказа — обязательна: «не выполнено» без объяснения это
              ещё один повод написать нам, а клиент должен разбираться сам. */}
          {job.status === "failed" && job.statusReason ? ` · ${job.statusReason}` : ""}
        </p>
      </div>

      <span className="shrink-0 rounded-md border border-fence px-2 py-0.5 text-[10.5px] text-mist">
        {job.modeTitle}
      </span>
    </li>
  );
}
