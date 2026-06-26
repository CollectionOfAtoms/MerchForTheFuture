import type { Metadata } from "next";
import { Geist, Zen_Dots } from "next/font/google";
import "./globals.css";
import { getThemeCookie } from "@/lib/theme/cookie";
import { themeInitScript } from "@/lib/theme/theme";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const zenDots = Zen_Dots({
  variable: "--font-zen-dots",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Merch For The Future",
  description: "Feel better about the future and look good doing it.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the stored manual theme choice server-side so the dark attribute is set
  // on the initial HTML for a no-flash paint (US-MFTF-19.4). When no choice is
  // stored, light is rendered and the inline script below applies the OS
  // preference before paint for first-time visitors.
  const theme = await getThemeCookie();
  const isDark = theme === "dark";
  return (
    <html
      lang="en"
      data-theme={theme ?? undefined}
      className={`${geist.variable} ${zenDots.variable} h-full${isDark ? " dark" : ""}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-text font-sans antialiased">
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
