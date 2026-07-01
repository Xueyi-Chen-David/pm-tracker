import type { DefaultSession } from "next-auth";

// 註：isBoss / jobTitle 是「每組織」欄位（OrganizationMember），不再放進 session。
// session 只保留全域身分（id / 顯示名稱）。組織角色 / 權限由 requireActiveOrg 解析。

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      nickname?: string | null;
      useNickname?: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    nickname?: string | null;
    useNickname?: boolean;
  }
}
