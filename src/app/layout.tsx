import type { Metadata } from "next";
import { Geist, Zen_Dots } from "next/font/google";
import "./globals.css";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${zenDots.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-bg text-text font-sans antialiased">
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
