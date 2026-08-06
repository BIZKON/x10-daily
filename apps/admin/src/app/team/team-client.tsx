"use client";

import { AuthorAvatar } from "@/components/author-avatar";
import type { TeamInvite, TeamMember } from "@/lib/api";
import { TEAM_ROLES, TEAM_ROLE_LABEL, TEAM_ROLE_SUMMARY, type TeamRole } from "@x10/config";
import { Check, Copy, Link2, Trash2, UserMinus } from "lucide-react";
import { useState, useTransition } from "react";

/**
 * Экран команды. Клиентский — нужны немедленный отклик на смену роли и показ
 * созданной ссылки, которую видно один раз.
 */

export function TeamClient({
  members,
  invites,
  onSetRole,
  onRemove,
  onInvite,
  onRevoke,
}: {
  members: TeamMember[];
  invites: TeamInvite[];
  onSetRole: (id: string, role: TeamRole) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onInvite: (
    role: TeamRole,
    maxUses: number,
  ) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
  onRevoke: (id: string) => Promise<void>;
}) {
  return (
    <div className="space-y-8">
      <InviteBox onInvite={onInvite} />
      <Members members={members} onSetRole={onSetRole} onRemove={onRemove} />
      {invites.length > 0 && <Invites invites={invites} onRevoke={onRevoke} />}
      <RoleLegend />
    </div>
  );
}

function InviteBox({
  onInvite,
}: {
  onInvite: (
    role: TeamRole,
    maxUses: number,
  ) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
}) {
  const [role, setRole] = useState<TeamRole>("editor");
  const [many, setMany] = useState(false);
  const [pending, start] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <section className="rounded-xl border border-fence bg-card p-6">
      <h2 className="m-0 font-display text-[15px] font-extrabold">Позвать человека</h2>
      <p className="m-0 mt-1.5 text-[12.5px] leading-[1.5] text-mist">
        Выберите роль и отправьте ссылку в чат. Человек откроет её, войдёт своим Telegram и сразу
        окажется в команде — заранее знать его ник не нужно.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {TEAM_ROLES.filter((r) => r !== "owner").map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={
              r === role
                ? "rounded-lg bg-paper px-3 py-1.5 text-[13px] font-semibold text-ink"
                : "rounded-lg bg-fence/40 px-3 py-1.5 text-[13px] font-semibold text-mist hover:text-paper"
            }
          >
            {TEAM_ROLE_LABEL[r]}
          </button>
        ))}
      </div>
      <p className="m-0 mt-2 text-[12px] text-haze">{TEAM_ROLE_SUMMARY[role]}</p>

      <label className="mt-4 flex cursor-pointer items-center gap-2 text-[13px] text-paper">
        <input
          type="checkbox"
          checked={many}
          onChange={(e) => setMany(e.target.checked)}
          className="h-4 w-4 rounded border-fence bg-night accent-red"
        />
        Ссылкой смогут воспользоваться несколько человек
      </label>
      <p className="m-0 mt-1 pl-6 text-[11.5px] leading-[1.5] text-haze">
        По умолчанию ссылка одноразовая: сработает у первого, кто её откроет. Многоразовая удобна,
        чтобы позвать сразу отдел, но пересланная в чужой чат она пустит и чужого.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            setUrl(null);
            setCopied(false);
            start(async () => {
              const r = await onInvite(role, many ? 20 : 1);
              if (r.ok) setUrl(r.url);
              else setError(r.error);
            });
          }}
          className="flex items-center gap-1.5 rounded-lg bg-red px-4 py-2 font-display text-[13px] font-semibold text-white disabled:opacity-50"
        >
          <Link2 size={14} strokeWidth={2} /> {pending ? "Создаём…" : "Создать ссылку"}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red/40 bg-red/[0.06] px-3 py-2 text-[12.5px] text-red">
          {error}
        </div>
      )}

      {url && (
        <div className="mt-4 rounded-lg border border-gold/40 bg-gold/[0.06] p-3">
          <div className="text-[12px] font-semibold text-gold">
            Скопируйте ссылку сейчас — второй раз её показать нельзя
          </div>
          <p className="m-0 mt-1 text-[11.5px] leading-[1.5] text-mist">
            В базе хранится только её отпечаток, поэтому восстановить ссылку невозможно. Потеряли —
            отзовите приглашение и создайте новое.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-night px-2 py-1.5 font-mono text-[11.5px] text-paper">
              {url}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(url);
                setCopied(true);
              }}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-fence px-2.5 py-1.5 text-[12px] text-mist hover:text-paper"
            >
              {copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} strokeWidth={2} />}
              {copied ? "Скопировано" : "Копировать"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Members({
  members,
  onSetRole,
  onRemove,
}: {
  members: TeamMember[];
  onSetRole: (id: string, role: TeamRole) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  return (
    <section>
      <h2 className="m-0 mb-3 font-display text-[15px] font-extrabold">
        В команде: {members.length}
      </h2>
      <div className="grid gap-3">
        {members.map((m) => (
          <MemberRow key={m.id} member={m} onSetRole={onSetRole} onRemove={onRemove} />
        ))}
      </div>
    </section>
  );
}

function MemberRow({
  member,
  onSetRole,
  onRemove,
}: {
  member: TeamMember;
  onSetRole: (id: string, role: TeamRole) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const name = member.displayName || member.username || "Без имени";

  const run = (fn: () => Promise<void>) => {
    setError(null);
    start(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось выполнить действие");
      }
    });
  };

  return (
    <div className="rounded-xl border border-fence bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <AuthorAvatar name={name} avatarUrl={member.avatarUrl} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-[14px] font-extrabold">{name}</span>
            {member.isMe && <span className="text-[11px] text-haze">это вы</span>}
          </div>
          {member.username && (
            <div className="truncate font-mono text-[11.5px] text-haze">@{member.username}</div>
          )}
        </div>

        <label className="flex items-center gap-2 text-[11px] font-semibold text-haze">
          Роль в команде
          <select
            aria-label="Роль в команде"
            value={member.role ?? "viewer"}
            disabled={pending}
            onChange={(e) => run(() => onSetRole(member.id, e.target.value as TeamRole))}
            className="rounded-lg border border-fence bg-night px-2.5 py-1.5 text-[13px] text-paper outline-none focus:border-gold/60 disabled:opacity-50"
          >
            {TEAM_ROLES.map((r) => (
              <option key={r} value={r}>
                {TEAM_ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>

        {!member.isMe && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Убрать ${name} из команды?`)) return;
              run(() => onRemove(member.id));
            }}
            title="Убрать из команды"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-fence text-mist transition hover:border-red/40 hover:text-red disabled:opacity-50"
          >
            <UserMinus size={14} strokeWidth={2} />
          </button>
        )}
      </div>

      <p className="m-0 mt-2 text-[11.5px] text-haze">
        {member.role ? TEAM_ROLE_SUMMARY[member.role] : "Роль не распознана"}
      </p>
      {error && <p className="m-0 mt-2 text-[12px] text-red">{error}</p>}
    </div>
  );
}

function Invites({
  invites,
  onRevoke,
}: {
  invites: TeamInvite[];
  onRevoke: (id: string) => Promise<void>;
}) {
  const [pending, start] = useTransition();

  return (
    <section>
      <h2 className="m-0 mb-3 font-display text-[15px] font-extrabold">Ссылки в работе</h2>
      <div className="grid gap-2">
        {invites.map((i) => {
          const left = i.maxUses - i.usedCount;
          const expired = new Date(i.expiresAt).getTime() < Date.now();
          return (
            <div
              key={i.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-fence bg-card px-4 py-3"
            >
              <span className="font-display text-[13px] font-extrabold">
                {TEAM_ROLE_LABEL[i.role]}
              </span>
              <span className="text-[12px] text-haze">
                {expired
                  ? "срок истёк"
                  : left <= 0
                    ? "использована"
                    : `осталось использований: ${left}`}
              </span>
              <span className="text-[12px] text-haze">
                до {new Date(i.expiresAt).toLocaleDateString("ru-RU")}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => start(() => onRevoke(i.id))}
                className="ml-auto flex items-center gap-1 rounded-lg border border-fence px-2.5 py-1.5 text-[12px] text-mist transition hover:border-red/40 hover:text-red disabled:opacity-50"
              >
                <Trash2 size={13} strokeWidth={2} /> Отозвать
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Что означает каждая роль — прямо на экране, а не в документации. */
function RoleLegend() {
  return (
    <section className="rounded-xl border border-fence bg-card p-5">
      <h2 className="m-0 mb-3 font-display text-[14px] font-extrabold">
        Что может каждая роль в команде
      </h2>
      <dl className="m-0 grid gap-2.5">
        {TEAM_ROLES.map((r) => (
          <div key={r} className="flex flex-wrap gap-x-2 text-[12.5px]">
            <dt className="font-semibold text-paper">{TEAM_ROLE_LABEL[r]}</dt>
            <dd className="m-0 text-mist">— {TEAM_ROLE_SUMMARY[r]}</dd>
          </div>
        ))}
      </dl>
      <p className="m-0 mt-3 text-[11.5px] leading-[1.5] text-haze">
        Владельцев может быть несколько, но хотя бы один нужен всегда: последнего нельзя ни
        понизить, ни убрать — иначе кабинетом станет некому управлять.
      </p>
    </section>
  );
}
