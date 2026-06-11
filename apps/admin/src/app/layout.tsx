import type { Metadata } from "next";
import "./globals.css";
import { DemoBanner } from "@/components/demo-banner";
import { Sidebar } from "@/components/sidebar";
import { fontDisplay, fontMono, fontSans } from "@/lib/fonts";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "X10 Admin — HumanGate",
  description: "Очередь к публикации, scorecard, утверждение редколлегии.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable}`}>
      <body className="min-h-dvh">
        <div className="flex min-h-dvh">
          {/* Cache Components (Next 16): Sidebar — 'use client' + usePathname()
              → dynamic URL-access → ДОЛЖЕН быть в <Suspense>, иначе prerender
              падает «Uncached data outside of Suspense». Placeholder того же
              размера (w-60), чтобы не было layout shift. Покрывает все страницы. */}
          <Suspense fallback={<aside className="w-60 shrink-0 border-r border-fence bg-card" />}>
            <Sidebar />
          </Suspense>
          <main className="flex-1 overflow-x-hidden">
            <DemoBanner />
            <div className="mx-auto max-w-[1280px] px-8 py-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
