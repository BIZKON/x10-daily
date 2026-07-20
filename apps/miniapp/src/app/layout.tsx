import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { PostHogProvider } from "@/components/posthog-provider";
import { TelegramProvider } from "@/components/telegram-provider";
import { fontDisplay, fontMono, fontSans } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "ProAgent AI — ИИ работает на вас",
  description:
    "Кейсы, методики и новости внедрения ИИ-агентов для малого и среднего бизнеса. Без хайпа, с цифрами выгоды.",
  metadataBase: new URL("https://app.pro-agent-ai.ru"),
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
