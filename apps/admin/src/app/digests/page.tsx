import { CheckCircle2, Clock, Mic, Plus } from "lucide-react";
import Link from "next/link";
import { fetchAdminLatestDigest } from "@/lib/api";

export default async function DigestsPage() {
  const latest = await fetchAdminLatestDigest();

  return (
    <>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="m-0 font-display text-2xl font-extrabold">Дайджесты</h1>
          <p className="m-0 mt-1 text-[13px] text-mist">
            Утренний выпуск в 07:00 — brief §3.7. Здесь показан последний отправленный.
          </p>
        </div>
        <Link
          href="/digests/new"
          className="flex items-center gap-1.5 rounded-lg bg-red px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-red-deep"
        >
          <Plus size={14} strokeWidth={2} /> Создать
        </Link>
      </header>

      {!latest ? (
        <EmptyOrUnavailable />
      ) : (
        <div className="rounded-xl border border-gold/30 bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Mic size={18} strokeWidth={1.75} className="text-gold" />
              <span className="font-display text-[15px] font-extrabold">
                Выпуск {formatIssueDate(latest.issueDate)}
              </span>
            </div>
            {latest.sentAt ? (
              <span className="flex items-center gap-1.5 text-[11px] text-success">
                <CheckCircle2 size={12} strokeWidth={2} /> Отправлен{" "}
                {new Date(latest.sentAt).toLocaleString("ru-RU", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[11px] text-mist">
                <Clock size={12} strokeWidth={2} /> Черновик
              </span>
            )}
          </div>

          <p className="m-0 mb-4 text-[14px] leading-relaxed">{latest.intro}</p>

          <div className="mb-4">
            <div className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-haze">
              Топ {latest.topArticleIds.length} {plural(latest.topArticleIds.length)}
            </div>
            <ol className="m-0 list-decimal space-y-1 pl-5 text-[12.5px] font-mono text-mist">
              {latest.topArticleIds.map((id) => (
                <li key={id} className="truncate">
                  {id}
                </li>
              ))}
            </ol>
          </div>

          {latest.tomorrow && (
            <div className="border-t border-fence pt-4">
              <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.15em] text-gold">
                Завтра
              </div>
              <p className="m-0 text-[13px] text-mist">{latest.tomorrow}</p>
            </div>
          )}
        </div>
      )}

      <p className="mt-4 text-[12px] text-haze">
        Полный список историй (с прокруткой по дням) добавим в следующем заходе.
      </p>
    </>
  );
}

function plural(n: number): string {
  if (n === 1) return "история";
  if (n >= 2 && n <= 4) return "истории";
  return "историй";
}

function formatIssueDate(d: string): string {
  return new Date(d).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function EmptyOrUnavailable() {
  return (
    <div className="rounded-xl border border-fence bg-card p-8 text-center text-[13px] text-mist">
      Дайджестов ещё нет, либо <code className="font-mono">apps/api</code> недоступен.
      <br />
      Когда NewsletterAssembleAgent сгенерирует первый выпуск — он появится здесь.
    </div>
  );
}
