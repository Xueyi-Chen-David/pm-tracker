import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isBoss: boolean;
      jobTitle?: string | null;
      nickname?: string | null;
      useNickname?: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    isBoss?: boolean;
    jobTitle?: string | null;
    nickname?: string | null;
    useNickname?: boolean;
  }
}
