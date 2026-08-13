import {
  type PublicationCardView,
  type PublicationRowView,
  type PublicationsView,
  fetchMyRole,
  fetchPublications,
} from "@/lib/api";
import { can } from "@x10/config";
import { CircleDashed, CircleSlash, Send } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { RejectForm, RequeueButton } from "./reject-form";

/**
 * Список публикаций на экране «Постинг» (спека 13.08, реестр разрыва §3.12).
 *
 * До этого экрана очередь публикаций не была видна НИГДЕ: стоп-кран показывал,
 * работает ли конвейер, но не показывал, что именно он выпустил. Кнопке «снято
 * площадкой» было некуда встать.
 *
 * 🔴 Карточка — МАТЕРИАЛ, строки внутри — ФОРМАТЫ (решение владельца 13.08).
 * Ровно это чинит миграция 0033: один материал живёт в площадке столько раз,
 * сколько у него форматов. Рассыпанные по общей ленте строки этого не
 * показывают, а именно «один материал → четыре формата» продано в КП.
 *
 * Группировку и порядок считает СЕРВЕР api — здесь только разметка.
 */

const FORMAT_LABEL: Record<string, string> = {
  post: "Пост",
  carousel: "Карусель",
  video: "Ролик",
  host_video: "Ролик с ведущим",
};

const CHANNEL_LABEL: Record<string, string> = {
  tg: "Telegram",
  vk: "ВКонтакте",
  dzen: "Дзен",
  linkedin: "LinkedIn",
};

const FILTERS = [
  { key: "all", label: "Все" },
  { key: "posted", label: "Опубликовано" },
  { key: "queued", label: "В очереди" },
  { key: "rejected", label: "Снято" },
] as const;

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  });
}

export async function Publications({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 🔴 PPR-грабля (CLAUDE.md §8): без `connection()` ВНУТРИ Suspense-компонента
  // билд запёк бы «Публикации недоступны» в статичную оболочку навсегда.
  await connection();
  const params = await searchParams;
  const raw = params.status;
  const status = (Array.isArray(raw) ? raw[0] : raw) ?? "all";

  const [data, role] = await Promise.all([fetchPublications({ status }), fetchMyRole()]);
  // Снимать и возвращать — управление выпуском: то же право проверяет сервер.
  const canPublish = can(role, "content.publish");

  return (
    <section className="mt-8">
      <header className="mb-4">
        <h2 className="m-0 flex items-center gap-2 font-display text-lg font-extrabold">
          <Send size={17} strokeWidth={1.75} /> Публикации
        </h2>
        <p className="mt-1 max-w-[74ch] text-[13px] leading-relaxed text-mist">
          Что вышло, что ждёт своего слота и что сняла площадка. Снятое не исчезает: причина
          остаётся в строке, а публикацию можно вернуть в очередь.
        </p>
      </header>

      {!data ? (
        <Unavailable />
      ) : (
        <>
          <Filters current={data.status} counts={data.counts} />
          {data.items.length === 0 ? (
            <Empty status={data.status} />
          ) : (
            <div className="space-y-3">
              {data.items.map((card) => (
                <Card key={card.articleId} card={card} canPublish={canPublish} />
              ))}
            </div>
          )}
          {data.truncated && (
            <p className="mt-3 text-[12px] text-haze">
              Показаны последние {data.limit} строк очереди — более старые публикации скрыты.
            </p>
          )}
          {!canPublish && data.items.length > 0 && (
            <p className="mt-3 text-[12px] text-haze">
              Отмечать снятие и возвращать в очередь может владелец или редактор.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Filters({
  current,
  counts,
}: {
  current: PublicationsView["status"];
  counts: PublicationsView["counts"];
}) {
  return (
    <nav className="mb-4 flex flex-wrap gap-2">
      {FILTERS.map((f) => {
        const active = current === f.key;
        return (
          <Link
            key={f.key}
            href={f.key === "all" ? "/posting" : `/posting?status=${f.key}`}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12.5px] transition ${
              active
                ? "border-gold/60 bg-gold/10 font-bold text-gold"
                : "border-fence text-mist hover:border-gold/40 hover:text-paper"
            }`}
          >
            {f.label}
            <span className="font-mono text-[11px] text-haze">{counts[f.key]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Card({ card, canPublish }: { card: PublicationCardView; canPublish: boolean }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-fence bg-card">
      <header className="border-b border-fence px-4 py-3">
        <Link
          href={`/article/${card.articleId}`}
          className="font-display text-[15px] font-bold leading-snug text-paper transition hover:text-gold"
        >
          {card.title}
        </Link>
      </header>
      <div className="divide-y divide-fence">
        {card.rows.map((row) => (
          <Row key={row.id} row={row} canPublish={canPublish} />
        ))}
      </div>
    </article>
  );
}

function Row({ row, canPublish }: { row: PublicationRowView; canPublish: boolean }) {
  const when = row.status === "rejected" ? row.rejectedAt : row.postedAt;

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="min-w-[7.5rem] text-[13.5px] font-semibold text-paper">
          {FORMAT_LABEL[row.format] ?? row.format}
        </span>
        <span className="min-w-[5.5rem] text-[13px] text-mist">
          {CHANNEL_LABEL[row.channel] ?? row.channel}
        </span>
        <span className="min-w-[7rem] font-mono text-[12.5px] text-haze">{fmtWhen(when)}</span>
        <StatusBadge status={row.status} />
        <div className="ml-auto">
          {canPublish && row.status === "posted" && <RejectForm id={row.id} />}
          {canPublish && row.status === "rejected" && <RequeueButton id={row.id} />}
        </div>
      </div>

      {row.status === "rejected" && row.rejectedReason && (
        <p className="m-0 mt-1.5 max-w-[74ch] text-[12.5px] leading-relaxed text-mist">
          <span className="text-haze">Причина: </span>
          {row.rejectedReason}
        </p>
      )}

      {/* Снятую и вернувшуюся в очередь строку иначе не отличить от новой —
          а именно ради этого причина и остаётся после возврата. */}
      {row.status === "queued" && row.rejectedReason && (
        <p className="m-0 mt-1.5 max-w-[74ch] text-[12.5px] leading-relaxed text-mist">
          <span className="text-haze">Уже снимали {fmtWhen(row.rejectedAt)}: </span>
          {row.rejectedReason}
        </p>
      )}

      {row.status === "queued" && row.attempts > 0 && row.lastError && (
        <p className="m-0 mt-1.5 max-w-[74ch] text-[12.5px] leading-relaxed text-red/80">
          Попыток отправки: {row.attempts}. Последняя ошибка: {row.lastError}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: PublicationRowView["status"] }) {
  if (status === "posted") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-success">
        <span className="h-1.5 w-1.5 rounded-full bg-success" /> Опубликовано
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-red">
        <CircleSlash size={13} strokeWidth={2} /> Снято площадкой
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-mist">
      <CircleDashed size={13} strokeWidth={1.75} /> В очереди
    </span>
  );
}

function Empty({ status }: { status: PublicationsView["status"] }) {
  const text =
    status === "rejected"
      ? "Площадка ничего не снимала. Это хорошая новость."
      : status === "queued"
        ? "Очередь пуста — всё, что конвейер подготовил, уже вышло."
        : status === "posted"
          ? "Пока ничего не публиковалось."
          : "Публикаций пока нет. Как только конвейер подготовит материал, он появится здесь и уйдёт в канал ближайшим слотом.";
  return (
    <div className="rounded-2xl border border-dashed border-fence bg-card p-6 text-center">
      <p className="m-0 mx-auto max-w-[60ch] text-[13.5px] leading-relaxed text-mist">{text}</p>
    </div>
  );
}

function Unavailable() {
  return (
    <div className="rounded-2xl border border-fence bg-card p-6">
      <p className="m-0 text-[13.5px] leading-relaxed text-mist">
        Список публикаций сейчас недоступен: api не ответил или сессия не установлена. Стоп-кран
        выше работает независимо — конвейер этим не затронут.
      </p>
    </div>
  );
}
