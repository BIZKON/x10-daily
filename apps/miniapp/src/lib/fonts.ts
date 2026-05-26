import { Inter, JetBrains_Mono, Manrope } from "next/font/google";

export const fontSans = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans-loaded",
  display: "swap",
});

export const fontDisplay = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-display-loaded",
  weight: ["400", "500", "700", "800"],
  display: "swap",
});

export const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-loaded",
  display: "swap",
});
