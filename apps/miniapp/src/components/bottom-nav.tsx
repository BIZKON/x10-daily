"use client";

import { cn } from "@x10/ui";
import { Briefcase, GraduationCap, Newspaper, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
};

const NAV: NavItem[] = [
  { href: "/", label: "Лента", Icon: Newspaper },
  { href: "/cases", label: "Кейсы", Icon: Briefcase },
  { href: "/learn", label: "Обучение", Icon: GraduationCap },
  { href: "/profile", label: "Я", Icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky bottom-0 z-10 flex justify-around border-t border-fence bg-night/95 px-1 pb-2.5 pt-2 backdrop-blur-md">
      {NAV.map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-md px-2.5 py-1.5 transition-colors",
              active ? "text-paper" : "text-haze",
            )}
          >
            <Icon size={22} strokeWidth={active ? 2 : 1.6} className={active ? "text-red" : ""} />
            <span className="text-[10px] font-semibold">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
