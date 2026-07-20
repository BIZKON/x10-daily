"use client";

import { Bell, ChevronLeft, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function TopBar({ title, back = false }: { title: string; back?: boolean }) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-fence bg-night/90 px-4 py-3.5 backdrop-blur-md">
      <div className="flex items-center gap-2.5">
        {back ? (
          <button
            type="button"
            aria-label="Назад"
            onClick={() => router.back()}
            className="-ml-1 grid h-9 w-9 place-items-center rounded-md hover:bg-white/5"
          >
            <ChevronLeft size={24} strokeWidth={1.75} />
          </button>
        ) : (
          <Link
            href="/"
            className="grid h-9 w-9 place-items-center rounded-xl bg-red font-display text-xs font-extrabold text-white"
          >
            PA
          </Link>
        )}
        <span className="font-display text-[17px] font-extrabold">{title}</span>
      </div>
      <div className="flex items-center gap-3.5 text-mist">
        <button type="button" aria-label="Поиск" className="grid h-9 w-9 place-items-center">
          <Search size={20} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label="Уведомления"
          className="relative grid h-9 w-9 place-items-center"
        >
          <Bell size={20} strokeWidth={1.75} />
          <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-red" />
        </button>
      </div>
    </header>
  );
}
