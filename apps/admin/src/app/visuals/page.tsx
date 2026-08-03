import { fetchVisualQueue } from "@/lib/api";
import { ImageIcon } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { approveVisual, regenerateVisual, rejectVisual } from "./actions";
import { VisualCard } from "./visual-card";

export const metadata = { title: "Обложки — ProAgent AI Admin" };

/**
 * Очередь ревью ИИ-обложек (Спека 2) — HumanGate на картинку.
 *
 * Конвейер генерирует иллюстрацию и оставляет её в `pending_review`. В канал
 * картинка уходит ТОЛЬКО после «Одобрить» (CLAUDE.md §4: AI не публикует
 * автономно). Не одобрили к слоту — пост уйдёт текстом, ничего не ломается.
 *
 * Данные тянутся внутри Suspense (сессия → динамика) — PPR-дыра, шелл статичен.
 */
export default function VisualsPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-card" />}>
      <VisualsContent />
    </Suspense>
  );
}

async function VisualsContent() {
  // 🔴 PPR-грабля (CLAUDE.md §8): на билде X10_API_BASE_URL не задан →
  // fetchVisualQueue возвращает null НЕ трогая cookies, дыры не возникает, и
  // Next запекает «Данные недоступны» в статический HTML навсегда. connection()
  // ВНУТРИ Suspense-компонента (не на уровне page) форсирует PPR-дыру: шелл
  // статичен, очередь тянется в рантайме.
  await connection();
  const queue = await fetchVisualQueue("pending_review");

  return (
    <>
      <header className="mb-6 border-b border-fence pb-5">
        <h1 className="m-0 flex items-center gap-2 font-display text-2xl font-extrabold">
          <ImageIcon size={22} strokeWidth={1.75} /> Обложки
        </h1>
        <p className="mt-1.5 text-[13px] text-mist">
          Сгенерированные иллюстрации ждут решения редактора. В канал картинка уходит только после
          «Одобрить» — конвейер не публикует её сам.
        </p>
      </header>

      {queue === null ? (
        <ApiUnavailable />
      ) : queue.items.length === 0 ? (
        <EmptyQueue />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {queue.items.map((item) => (
            <VisualCard
              key={item.id}
              item={item}
              onApprove={approveVisual}
              onReject={rejectVisual}
              onRegenerate={regenerateVisual}
            />
          ))}
        </div>
      )}
    </>
  );
}

function EmptyQueue() {
  return (
    <div className="rounded-2xl border border-fence bg-card p-6">
      <h2 className="m-0 font-display text-lg font-extrabold">Очередь пуста</h2>
      <p className="mt-2 text-[14px] text-mist">
        Обложек на ревью нет. Новая появится, когда конвейер доведёт следующую статью и сгенерирует
        для неё иллюстрацию.
      </p>
    </div>
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
