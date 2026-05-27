import type { Metadata } from "next";
import "./globals.css";
import { DemoBanner } from "@/components/demo-banner";
import { Sidebar } from "@/components/sidebar";
import { fontDisplay, fontMono, fontSans } from "@/lib/fonts";

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
    <html
      lang="ru"
      className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable}`}
    >
      <body className="min-h-dvh">
        <div className="flex min-h-dvh">
          <Sidebar />
          <main className="flex-1 overflow-x-hidden">
            <DemoBanner />
            <div className="mx-auto max-w-[1280px] px-8 py-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
