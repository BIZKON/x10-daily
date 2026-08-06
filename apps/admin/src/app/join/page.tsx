import { TgLoginWidget } from "@/components/tg-login-widget";
import { Suspense } from "react";

export const metadata = { title: "Приглашение — ProAgent AI" };

/**
 * Вход по пригласительной ссылке (Спека 5).
 *
 * Отдельная страница, а не `/login?invite=…`: человек попадает сюда впервые и
 * должен понимать, куда его позвали, ещё до нажатия кнопки. На `/login` он
 * увидел бы форму входа в систему, о которой ничего не знает.
 *
 * ⚠️ Страница публичная — middleware пускает без сессии, иначе приглашённого
 * развернуло бы на `/login` и ссылка не сработала бы никогда.
 */
export default function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  return (
    <Suspense fallback={<JoinSkeleton />}>
      <JoinContent searchParams={searchParams} />
    </Suspense>
  );
}

function JoinSkeleton() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="h-72 w-full max-w-sm animate-pulse rounded-2xl bg-card" />
    </div>
  );
}

async function JoinContent({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const token = (await searchParams).t?.trim();
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight">Вас пригласили</h1>
          <p className="mt-2 text-sm leading-[1.55] text-muted-foreground">
            в кабинет ProAgent AI — сюда команда приводит контент к публикации.
          </p>
        </div>

        {!token ? (
          <Problem>
            В ссылке нет кода приглашения. Скорее всего она скопирована не целиком — попросите
            прислать её заново.
          </Problem>
        ) : !botUsername ? (
          <Problem>Кабинет не настроен на вход через Telegram. Сообщите администратору.</Problem>
        ) : (
          <>
            <div className="flex flex-col items-center gap-4">
              <div className="min-h-[40px]">
                <TgLoginWidget botUsername={botUsername} inviteToken={token} />
              </div>
            </div>
            <p className="mt-5 text-center text-[11.5px] leading-[1.55] text-muted-foreground">
              Войдите тем Telegram-аккаунтом, которым пользуетесь. Роль в команде выдаст само
              приглашение — ничего дополнительно вводить не нужно.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-red/40 bg-red/[0.06] px-4 py-3 text-[13px] leading-[1.55] text-red">
      {children}
    </div>
  );
}
