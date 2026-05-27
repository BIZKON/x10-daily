import { CheckCircle2, ChevronLeft, Send } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteButton } from "@/components/form/delete-button";
import { fetchAdminDigestByDate } from "@/lib/api";
import { deleteDigest, markDigestSent, updateDigest } from "../actions";
import { DigestForm } from "../digest-form";

export default async function EditDigestPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const digest = await fetchAdminDigestByDate(date);
  if (!digest) notFound();

  const updateBound = updateDigest.bind(null, digest.id, digest.issueDate);
  const deleteBound = deleteDigest.bind(null, digest.id);
  const markSentBound = markDigestSent.bind(null, digest.id, digest.issueDate);

  return (
    <>
      <header className="mb-6">
        <Link
          href="/digests"
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-mist hover:text-paper"
        >
          <ChevronLeft size={14} strokeWidth={1.75} /> К дайджестам
        </Link>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="m-0 font-display text-2xl font-extrabold">
              Выпуск {new Date(digest.issueDate).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </h1>
            <p className="m-0 mt-1 text-[13px] text-mist">
              {digest.sentAt ? (
                <span className="inline-flex items-center gap-1.5 text-success">
                  <CheckCircle2 size={12} strokeWidth={2} /> Отправлен{" "}
                  {new Date(digest.sentAt).toLocaleString("ru-RU")}
                </span>
              ) : (
                <span className="text-mist">Черновик · не отправлен</span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {!digest.sentAt && (
              <form action={markSentBound}>
                <button
                  type="submit"
                  className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/[0.06] px-4 py-2 text-[12px] font-semibold text-success transition hover:bg-success/[0.12]"
                >
                  <Send size={14} strokeWidth={1.75} /> Отметить отправленным
                </button>
              </form>
            )}
            <form action={deleteBound}>
              <DeleteButton confirmMessage={`Удалить дайджест ${digest.issueDate} навсегда?`} />
            </form>
          </div>
        </div>
      </header>

      <div className="max-w-3xl rounded-xl border border-fence bg-card p-6">
        <DigestForm action={updateBound} defaults={digest} submitLabel="Сохранить изменения" />
      </div>
    </>
  );
}
