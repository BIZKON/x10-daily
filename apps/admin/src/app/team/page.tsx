import { fetchTeam, fetchTeamInvites } from "@/lib/api";
import { UsersRound } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { createInvite, removeMember, revokeInvite, setMemberRole } from "./actions";
import { TeamClient } from "./team-client";

export const metadata = { title: "Команда — ProAgent AI" };

/**
 * Команда клиента (Спека 5): кто в кабинете, с какой ролью, и приглашения.
 *
 * Раздел виден только Владельцу — право `team.manage`. Сервер отдаёт 403 всем
 * остальным, поэтому «нет доступа» здесь честное состояние, а не ошибка.
 */
export default function TeamPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-card" />}>
      <TeamContent />
    </Suspense>
  );
}

async function TeamContent() {
  // 🔴 PPR-грабля (CLAUDE.md §8): без connection() внутри Suspense Next запечёт
  // «Данные недоступны» в статику навсегда.
  await connection();
  const [team, invites] = await Promise.all([fetchTeam(), fetchTeamInvites()]);

  return (
    <>
      <header className="mb-6 border-b border-fence pb-5">
        <h1 className="m-0 flex items-center gap-2 font-display text-2xl font-extrabold">
          <UsersRound size={22} strokeWidth={1.75} /> Команда
        </h1>
        <p className="mt-1.5 text-[13px] leading-[1.55] text-mist">
          Кто работает в кабинете и что каждому разрешено. <b>Роль в команде</b> — это права:
          публиковать, править, только смотреть. Не путайте с <b>должностью</b> из карточки автора —
          та лишь подписывает человека под статьёй и прав не даёт.
        </p>
      </header>

      {team === null ? (
        <NoAccess />
      ) : (
        <TeamClient
          members={team.items}
          invites={invites?.items ?? []}
          onSetRole={setMemberRole}
          onRemove={removeMember}
          onInvite={createInvite}
          onRevoke={revokeInvite}
        />
      )}
    </>
  );
}

function NoAccess() {
  return (
    <div className="rounded-2xl border border-fence bg-card p-6">
      <h2 className="m-0 font-display text-lg font-extrabold">Раздел доступен владельцу</h2>
      <p className="mt-2 text-[14px] leading-[1.55] text-mist">
        Управлять командой может только Владелец кабинета — доступ не выдаёт тот, кому его выдали.
        Если вам нужны права, попросите владельца изменить вашу роль.
      </p>
      <p className="mt-2 text-[12.5px] text-haze">
        Если вы владелец и видите это сообщение — значит сессия не установлена или api не отвечает.
      </p>
    </div>
  );
}
