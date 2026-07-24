import { BottomNav } from "@/components/bottom-nav";
import { StartParamRouter } from "@/components/start-param-router";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[640px] flex-col">
      {/* Deep-link из канала: если Mini App открыт по t.me/<bot>?startapp=<slug>,
          роутим на статью. Рендерит null. */}
      <StartParamRouter />
      <div className="flex-1 pb-2">{children}</div>
      <BottomNav />
    </div>
  );
}
