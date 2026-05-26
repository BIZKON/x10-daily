import { BottomNav } from "@/components/bottom-nav";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[640px] flex-col">
      <div className="flex-1 pb-2">{children}</div>
      <BottomNav />
    </div>
  );
}
