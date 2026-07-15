import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { OrgRole } from "@prisma/client";
import { db } from "./db";
import { getCurrentUser, requireUser } from "./auth-helpers";
import {
  canSeeModule,
  firstAllowedHref,
  isAdminRole,
  type ModuleKey,
} from "@/lib/modules";

/** 模組可見性判定用的存取資訊（角色 / 老闆 / 模組白名單）。 */
export type ModuleAccess = {
  role: OrgRole;
  isBoss: boolean;
  allowedModules: string[];
};

/** 記住「目前組織」的 cookie 名稱。 */
export const ACTIVE_ORG_COOKIE = "pm_active_org";

export const ACTIVE_ORG_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

/**
 * 目前登入者的所有組織成員資格（含組織 + 組織內欄位：角色 / isBoss…）。
 * 以 React cache 於單一請求內去重（版面 + 頁面 + 各 require 會重複呼叫）。
 */
export const getMyMemberships = cache(async (userId: string) => {
  return db.organizationMember.findMany({
    where: { userId },
    include: {
      organization: { select: { id: true, name: true } },
    },
    orderBy: [{ organization: { name: "asc" } }],
  });
});

export type MyMembership = Awaited<ReturnType<typeof getMyMemberships>>[number];

type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export type ActiveOrgContext = {
  user: SessionUser;
  org: { id: string; name: string };
  membership: MyMembership;
  memberships: MyMembership[];
};

async function readActiveOrgCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(ACTIVE_ORG_COOKIE)?.value;
}

/**
 * 從 cookie / 唯一組織推得「目前組織」。
 * - cookie 指向的有效組織 → 用它
 * - 否則恰好一個組織 → 自動用該組織（免在 render 期間寫 cookie）
 * - 多個且無有效 cookie，或零個 → 回 null（呼叫端決定導向 /orgs）
 */
export function pickActiveMembership(
  memberships: MyMembership[],
  cookieOrgId?: string,
): MyMembership | null {
  if (memberships.length === 0) return null;
  if (cookieOrgId) {
    const byCookie = memberships.find((m) => m.organizationId === cookieOrgId);
    if (byCookie) return byCookie;
  }
  if (memberships.length === 1) return memberships[0];
  return null;
}

/** 解析目前組織上下文，解析不到回 null（給 route handler / 非強制情境，不做導向）。 */
export async function getActiveOrg(): Promise<ActiveOrgContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const memberships = await getMyMemberships(user.id);
  const active = pickActiveMembership(memberships, await readActiveOrgCookie());
  if (!active) return null;
  return {
    user,
    org: active.organization,
    membership: active,
    memberships,
  };
}

/** 解析目前組織上下文，解析不到就導向 /orgs（選擇 / 建立組織）。 */
export async function requireActiveOrg(): Promise<ActiveOrgContext> {
  const user = await requireUser();
  const memberships = await getMyMemberships(user.id);
  const active = pickActiveMembership(memberships, await readActiveOrgCookie());
  if (!active) redirect("/orgs");
  return {
    user,
    org: active.organization,
    membership: active,
    memberships,
  };
}

/** 是否為管理者 / 老闆。 */
export function isManagerOrBoss(m: {
  role: OrgRole;
  isBoss: boolean;
}): boolean {
  return isAdminRole(m.role) || m.isBoss;
}

/** 真實身分的有效存取（模組可見性）。 */
export function selfAccess(m: MyMembership): ModuleAccess {
  return {
    role: m.role,
    isBoss: m.isBoss,
    allowedModules: m.allowedModules,
  };
}

/**
 * 要求登入 + 目前組織 + 該模組可見權限。無權限時導向使用者第一個可見模組。
 * 每次都讀最新 membership，調整立即生效。
 */
export async function requireModuleAccess(
  key: ModuleKey,
): Promise<ActiveOrgContext> {
  const ctx = await requireActiveOrg();
  const access = selfAccess(ctx.membership);
  if (!canSeeModule(access, key)) {
    redirect(firstAllowedHref(access));
  }
  return ctx;
}

/** 要求目前組織 + 指定角色（成員管理等敏感操作用）。 */
export async function requireActiveOrgWithRole(
  roles: OrgRole[],
): Promise<ActiveOrgContext> {
  const ctx = await requireActiveOrg();
  if (!roles.includes(ctx.membership.role)) {
    throw new Error("需要組織擁有者 / 管理員權限才能執行此操作。");
  }
  return ctx;
}

/** 是否可管理成員（擁有者 / 管理員）。 */
export function canManageMembers(role: OrgRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/**
 * requireActiveOrg + UI 用的「有效可管理」與「有效存取」。
 * - `canManage`：真實為管理者(OWNER/ADMIN)。
 * - `access`：模組可見性存取，頁面用它決定顯示範圍。
 */
export async function requireManageContext(): Promise<
  ActiveOrgContext & {
    canManage: boolean;
    access: ModuleAccess;
  }
> {
  const ctx = await requireActiveOrg();
  const access = selfAccess(ctx.membership);
  const canManage = canManageMembers(ctx.membership.role);
  return {
    ...ctx,
    canManage,
    access,
  };
}
