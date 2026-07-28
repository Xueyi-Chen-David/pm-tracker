import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "專案儀表板 · Project Pulse",
  description: "一眼掌握所有專案、常態與一次性任務的進度與每週狀態。",
  // iOS Safari 不認 manifest.ts 的 display/icons，得靠這幾個標籤才會有「加入主畫面」
  // 後的全螢幕獨立視窗＋正確圖示（manifest.ts 負責 Android 的安裝提示與圖示）。
  appleWebApp: {
    capable: true,
    title: "Project Pulse",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hant-TW"
      className={`${geistSans.variable} ${geistMono.variable} h-full scroll-smooth antialiased`}
    >
      <body className="bg-muted/30 min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
