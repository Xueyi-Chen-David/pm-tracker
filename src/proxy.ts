import NextAuth from "next-auth";
import { authConfig } from "@/server/auth.config";

// Next 16 起 middleware 改名為 proxy（功能相同）。
// 只用 edge-safe 的 authConfig（不含 pg / Prisma），避免 Node 模組進入 Edge runtime。
export default NextAuth(authConfig).auth;

export const config = {
  // 排除 api、靜態資源、PWA 安裝相關檔案（manifest / service worker，瀏覽器要能在
  // 未登入狀態下也讀得到才能判斷可安裝、正確顯示圖示）；其餘頁面都經過認證檢查。
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
