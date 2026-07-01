import NextAuth from "next-auth";
import { authConfig } from "@/server/auth.config";

// Next 16 起 middleware 改名為 proxy（功能相同）。
// 只用 edge-safe 的 authConfig（不含 pg / Prisma），避免 Node 模組進入 Edge runtime。
export default NextAuth(authConfig).auth;

export const config = {
  // 排除 api、靜態資源；其餘頁面都經過認證檢查。
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
