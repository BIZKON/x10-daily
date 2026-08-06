import { fetchAdminSources } from "@/lib/api";
import { Rss } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { createSource, deleteSource, toggleSource } from "./actions";
import { SourceForm } from "./source-form";
import { SourceRow } from "./source-row";

export const metadata = { title: "Источники — ProAgent AI Admin" };

/**
 * Источники парсинга — ленты, из которых конвейер делает посты.
 *
 * До этого раздела таблица источников наполнялась ТОЛЬКО SQL-ом: подключить
 * клиенту новую ленту означало нашу ручную работу на проде.
 *
 * Данные тянутся внутри Suspense (сессия → динамика) — PPR-дыра, шелл статичен.
 */
export default function SourcesPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-card" />}>
      <SourcesContent />
    </Suspense>
  );
}

async function SourcesContent() {
  // 🔴 PPR-грабля (CLAUDE.md §8): на билде X10_API_BASE_URL не задан →
  // fetchAdminSources вернёт null НЕ трогая cookies, динамической дыры не
  // возникнет, и Next запечёт «Данные недоступны» в статику навсегда.
  // connection() ВНУТРИ Suspense-компонента форсирует дыру.
  await connection();
  const data = await fetchAdminSources();

  const items = data?.items ?? [];
  const working = items.filter((s) => s.enabled).length;

  return (
    <>
      <header className="mb-6 border-b border-fence pb-5">
        <h1 className="m-0 flex items-center gap-2 font-display text-2xl font-extrabold">
          <Rss size={22} strokeWidth={1.75} /> Источники
        </h1>
        <p className="mt-1.5 text-[13px] leading-[1.55] text-mist">
          Ленты, из которых конвейер берёт материал для постов. Добавленный источник сначала
          проверяется: система читает его ленту целиком и запоминает всё, что там уже есть, — иначе
          первые же посты ушли бы старыми новостями за месяцы. Включается он только после удачной
          проверки.
        </p>
      </header>

      <div className="mb-8 rounded-xl border border-fence bg-card p-6">
        <h2 className="m-0 mb-4 font-display text-[15px] font-extrabold">Добавить источник</h2>
        <SourceForm action={createSource} />
      </div>

      {data === null ? (
        <ApiUnavailable />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-fence bg-card p-6">
          <h2 className="m-0 font-display text-lg font-extrabold">Источников пока нет</h2>
          <p className="mt-2 text-[14px] text-mist">
            Добавьте первую ленту формой выше — конвейеру не из чего писать, пока источников нет.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-3 text-[12px] text-haze">
            Всего {items.length}, работают {working}
          </div>
          <div className="grid gap-3">
            {items.map((s) => (
              <SourceRow key={s.id} source={s} onToggle={toggleSource} onDelete={deleteSource} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function ApiUnavailable() {
  return (
    <div className="rounded-2xl border border-red/40 bg-red/5 p-6">
      <h2 className="m-0 font-display text-lg font-extrabold text-red">Данные недоступны</h2>
      <p className="mt-2 text-[14px] text-mist">
        Не задан <code className="font-mono text-paper">X10_API_BASE_URL</code>, api не отвечает,
        или сессия не установлена (войди через <code className="font-mono text-paper">/login</code>
        ).
      </p>
    </div>
  );
}
