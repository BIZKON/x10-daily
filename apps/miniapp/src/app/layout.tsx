import type { Metadata, Viewport } from "next";
import "./globals.css";
import { fontDisplay, fontMono, fontSans } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "X10 Daily — Деловое утро за 7 минут",
  description:
    "Ежедневное деловое медиа сообщества Рыбакова. Smart Brevity, цифры с источниками, без инфобиза.",
  metadataBase: new URL("https://daily.x10.media"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0B0B0E",
  colorScheme: "dark",
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
      <body>{children}</body>
    </html>
  );
}
