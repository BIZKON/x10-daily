import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { PostHogProvider } from "@/components/posthog-provider";
import { TelegramProvider } from "@/components/telegram-provider";
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
      // TG WebApp SDK инжектит --tg-viewport-height / --tg-viewport-stable-height
      // CSS-переменные после SSR. Ожидаемо, не баг — глушим hydration warning.
      suppressHydrationWarning
    >
      <body>
        {/* TG WebApp SDK — injects window.Telegram.WebApp при загрузке внутри
            Telegram. Вне TG — no-op, TelegramProvider fallback на dev login. */}
        <Script src="https://telegram.org/js/telegram-web-app.js?56" strategy="beforeInteractive" />
        {/* PostHog аналитика (EU). Рендерит null; пустой ключ → no-op. */}
        <PostHogProvider />
        <TelegramProvider>{children}</TelegramProvider>
      </body>
    </html>
  );
}
