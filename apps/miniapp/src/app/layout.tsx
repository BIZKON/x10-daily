import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { PostHogProvider } from "@/components/posthog-provider";
import { TelegramProvider } from "@/components/telegram-provider";
import { fontDisplay, fontMono, fontSans } from "@/lib/fonts";
import {
  OG_IMAGE,
  SITE_DESCRIPTION,
  SITE_LOCALE,
  SITE_NAME,
  SITE_ORIGIN,
  SITE_TITLE,
} from "@/lib/site-meta";

/**
 * Метадата + превью ссылок. Главный канал дистрибуции — Telegram: канал постит
 * 4 ссылки в день («Читать в ProAgent AI →»), и каждая разворачивается в превью
 * по og-тегам. Раньше og-тегов не было вовсе → превью без картинки и с общим
 * заголовком на всех статьях. Иконки даёт file-convention Next (`icon.png`,
 * `apple-icon.png` рядом с этим файлом). Картинку превью задаём ЯВНО из
 * site-meta — тем же объектом, что и статья, иначе наборы тегов разъезжаются
 * (см. комментарий в site-meta.ts). `title.template` подставляет бренд к
 * заголовку статьи (см. generateMetadata в article/[slug]).
 */
export const metadata: Metadata = {
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  metadataBase: new URL(SITE_ORIGIN),
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: SITE_LOCALE,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
    // `url` намеренно НЕ задаём: иначе все разделы унаследовали бы og:url корня
    // и объявили бы себя главной. Статья ставит свой url в generateMetadata.
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
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
