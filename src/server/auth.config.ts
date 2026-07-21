import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe 認證設定（給 middleware 用）。
 * 不包含 Prisma adapter / pg / db 呼叫，否則會被打包進 Edge runtime 而爆掉。
 * 完整設定（providers + adapter）在 auth.ts。
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [],
  session: { strategy: "jwt" },
  callbacks: {
    // middleware 用這個決定能不能進入頁面；回傳 false → 導向 signIn page。
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const path = nextUrl.pathname;
      const isPublic =
        path === "/login" ||
        path === "/verify-email-change" || // 點新信箱驗證連結時不必先登入
        path.startsWith("/api/auth");
      if (isPublic) return true;
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
