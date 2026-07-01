import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";
import { authConfig } from "./auth.config";
import { db } from "./db";

const providers: Provider[] = [];

// Google OAuth — 僅在設定了 client id/secret 時啟用。
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

// 開發用快速登入：輸入 email 即登入（會自動建立使用者）。正式環境請關閉。
if (process.env.ALLOW_DEV_LOGIN === "1") {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(creds) {
        const email = String(creds?.email ?? "")
          .trim()
          .toLowerCase();
        if (!email || !email.includes("@")) return null;
        const name = email.split("@")[0];
        const user = await db.user.upsert({
          where: { email },
          update: {},
          create: { email, name },
        });
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  );
}

export const providerIds = providers
  .map((p) => (typeof p === "function" ? p().id : p.id))
  .filter(Boolean) as string[];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  trustHost: true,
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        // 註：isBoss / jobTitle 已改為「每組織」欄位（OrganizationMember），
        // 不再放進全域 session；由 requireActiveOrg 於各請求解析。
        const dbUser = await db.user.findUnique({
          where: { id: user.id },
          select: { nickname: true, useNickname: true },
        });
        token.nickname = dbUser?.nickname ?? null;
        token.useNickname = dbUser?.useNickname ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      session.user.nickname = (token.nickname as string | null) ?? null;
      session.user.useNickname = Boolean(token.useNickname);
      return session;
    },
  },
});
