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
  // 沒設定時，手機鍵盤彈出只會縮小「視覺視窗」，不會縮小版面視窗——這裡所有對話框
  // （如 CRM「新增聯絡人」）都是 fixed + dvh 定位、置中，鍵盤蓋住的下半部（含送出鈕）
  // 版面完全不會跟著往上收，使用者點進欄位打字後送出鈕會被鍵盤蓋住按不到，且對話框內
  // 捲動也救不了——整個對話框本身是固定尺寸、固定在畫面上的位置，捲動只會動內容，
  // 不會把送出鈕移出鍵盤範圍。resizes-content 讓鍵盤彈出時版面視窗跟著縮小，dvh／
  // fixed 定位才會即時收窄到鍵盤上緣，送出鈕自動留在可見、可點的範圍內。
  interactiveWidget: "resizes-content",
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
