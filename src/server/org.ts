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
import {
  resolvePermissions,
  hasPermission,
  type PermissionKey,
} from "@/lib/permissions";

/** 模組可見性 / 權限判定用的存取資訊（角色 / 老闆 / 模組白名單 / 已解析權限）。 */
export type ModuleAccess = {
  role: OrgRole;
  isBoss: boolean;
  allowedModules: string[];
  /** 已解析的有效權限 key（管理者含全部；一般成員＝各角色 permissions 聯集）。 */
  permissions: PermissionKey[];
  /** 供進一步 hasPermission 判定的角色 permissions 原料。 */
  roleDefs: { permissions: string[] }[];
};

/** 記住「目前組織」的 cookie 名稱。 */
export const ACTIVE_ORG_COOKIE = "pm_active_org";

/** 「以員工視角預覽」的 cookie 名稱（值＝"employee" 時啟用）。 */
export const VIEW_AS_COOKIE = "pm_view_as";

export const ACTIVE_ORG_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

/**
 * 目前登入者的所有組織成員資格（含組織 + 組織內欄位：角色 / isBoss / 權限…）。
 * 以 React cache 於單一請求內去重（版面 + 頁面 + 各 require 會重複呼叫）。
 */
export const getMyMemberships = cache(async (userId: string) => {
  return db.organizationMember.findMany({
    where: { userId },
    include: {
      organization: { select: { id: true, name: true } },
      // 自訂角色（人資 / 會計…）：解析權限與頁面可見性用。
      roleDefs: {
        select: {
          id: true,
          name: true,
          color: true,
          permissions: true,
          visibleModules: true,
        },
        orderBy: { sortOrder: "asc" },
      },
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

/** 是否為管理者 / 老闆（可看管理者專屬頁、可切換員工視角預覽）。 */
export function isManagerOrBoss(m: {
  role: OrgRole;
  isBoss: boolean;
}): boolean {
  return isAdminRole(m.role) || m.isBoss;
}

/**
 * 「以…視角預覽」的狀態（管理者專用）：
 * - self：真實身分（未預覽）
 * - employee：一般員工（無任何自訂角色）
 * - role：某個自訂角色（如 人資）的視角——權限＝該角色 permissions
 */
export type ViewAs =
  | { mode: "self" }
  | { mode: "employee" }
  | { mode: "role"; roleId: string };

/** 讀「以…視角預覽」cookie 並解析成 ViewAs。 */
export async function getViewAs(): Promise<ViewAs> {
  const store = await cookies();
  const v = store.get(VIEW_AS_COOKIE)?.value;
  if (v === "employee") return { mode: "employee" };
  if (v && v.startsWith("role:")) {
    const roleId = v.slice("role:".length);
    if (roleId) return { mode: "role", roleId };
  }
  return { mode: "self" };
}

/** 舊介面相容：是否處於「員工視角」預覽。 */
export async function getViewAsEmployee(): Promise<boolean> {
  return (await getViewAs()).mode === "employee";
}

/** 一般員工的存取（無任何角色 / 白名單 / 權限）。 */
const EMPLOYEE_ACCESS: ModuleAccess = {
  role: "MEMBER",
  isBoss: false,
  allowedModules: [],
  permissions: [],
  roleDefs: [],
};

/**
 * 由「已指派角色的可見頁面」推得成員的有效頁面白名單（給 canSeeModule 用；空＝可見全部）。
 * - 沒有任何角色 → 用 fallback（成員自身 allowedModules，維持現狀）。
 * - 有角色，且任一角色「未限制頁面」(visibleModules 空＝全部) → 可見全部（回 []）。
 * - 否則 → 各角色 visibleModules 的聯集（角色越多看得越多，不會互相縮減）。
 * 管理者 / 老闆本就在 canSeeModule 一律全開，不受此影響。
 */
function allowedModulesFromRoles(
  roleVisibleLists: string[][],
  fallback: string[],
): string[] {
  if (roleVisibleLists.length === 0) return fallback;
  if (roleVisibleLists.some((list) => list.length === 0)) return [];
  return [...new Set(roleVisibleLists.flat())];
}

/** 真實身分的有效存取（含自訂角色權限聯集 + 角色頁面可見性）。 */
export function selfAccess(m: MyMembership): ModuleAccess {
  const roleDefs = m.roleDefs.map((r) => ({ permissions: r.permissions }));
  const allowedModules = allowedModulesFromRoles(
    m.roleDefs.map((r) => r.visibleModules),
    m.allowedModules,
  );
  return {
    role: m.role,
    isBoss: m.isBoss,
    allowedModules,
    permissions: [...resolvePermissions({ role: m.role, roleDefs })],
    roleDefs,
  };
}

/** 以「單一自訂角色」視角的存取（一般員工 + 該角色權限 + 該角色可見頁面）。 */
function roleAccess(role: {
  permissions: string[];
  visibleModules: string[];
}): ModuleAccess {
  return {
    role: "MEMBER",
    isBoss: false,
    // 空＝可見全部頁面，與具此角色的真實成員一致。
    allowedModules: role.visibleModules,
    permissions: [...resolvePermissions({ role: "MEMBER", roleDefs: [role] })],
    roleDefs: [{ permissions: role.permissions }],
  };
}

export type ResolvedAccess = {
  access: ModuleAccess;
  /** 管理者正處於預覽（員工或角色視角）。 */
  previewing: boolean;
  preview: ViewAs;
  /** 預覽角色名稱（banner 顯示用；role 模式且角色存在時才有）。 */
  previewRoleName?: string;
};

/**
 * 解析「有效存取」，套用管理者的視角預覽。非管理者 / 老闆一律用真實身分。
 * 預覽只影響「看得到什麼」；伺服器端 action 仍以真實身分（requireOrgPermission）驗證。
 */
export async function resolveAccess(
  ctx: ActiveOrgContext,
): Promise<ResolvedAccess> {
  const view = await getViewAs();
  const manager = isManagerOrBoss(ctx.membership);
  if (view.mode === "self" || !manager) {
    return {
      access: selfAccess(ctx.membership),
      previewing: false,
      preview: { mode: "self" },
    };
  }
  if (view.mode === "employee") {
    return { access: EMPLOYEE_ACCESS, previewing: true, preview: view };
  }
  // 角色視角：載入該角色（限本組織）；角色已不存在則退回員工視角。
  const role = await db.orgRoleDef.findFirst({
    where: { id: view.roleId, organizationId: ctx.org.id },
    select: { name: true, permissions: true, visibleModules: true },
  });
  if (!role) {
    return { access: EMPLOYEE_ACCESS, previewing: true, preview: { mode: "employee" } };
  }
  return {
    access: roleAccess(role),
    previewing: true,
    preview: view,
    previewRoleName: role.name,
  };
}

/** access 是否具備某權限（permissions 已解析，管理者含全部）。 */
export function accessHas(access: ModuleAccess, key: PermissionKey): boolean {
  return access.permissions.includes(key);
}

/**
 * 要求登入 + 目前組織 + 該模組可見權限。套用視角預覽（管理者預覽中造訪看不到的頁會被導開）。
 * 無權限時導向使用者第一個可見模組。每次都讀最新 membership / 角色，調整立即生效。
 */
export async function requireModuleAccess(
  key: ModuleKey,
): Promise<ActiveOrgContext> {
  const ctx = await requireActiveOrg();
  const { access } = await resolveAccess(ctx);
  if (!canSeeModule(access, key)) {
    redirect(firstAllowedHref(access));
  }
  return ctx;
}

/**
 * 伺服器端 action 用：要求目前使用者（**真實身分**，不受預覽影響）具備某權限，否則丟錯。
 * 管理者(OWNER/ADMIN)一律通過。
 */
export async function requireOrgPermission(
  key: PermissionKey,
): Promise<ActiveOrgContext> {
  const ctx = await requireActiveOrg();
  if (
    !hasPermission(
      { role: ctx.membership.role, roleDefs: ctx.membership.roleDefs },
      key,
    )
  ) {
    throw new Error("你沒有執行此操作的權限。");
  }
  return ctx;
}

/** 真實身分是否具備某權限（供 action 內就地判斷「自己 vs 他人」等）。 */
export function membershipHas(m: MyMembership, key: PermissionKey): boolean {
  return hasPermission({ role: m.role, roleDefs: m.roleDefs }, key);
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
 * - `canManage`：真實為管理者(OWNER/ADMIN)**且未**處於預覽。
 * - `previewing`：管理者正以員工 / 角色視角預覽中。
 * - `access`：套用預覽後的有效存取（含 permissions），頁面用它決定顯示範圍。
 * - `can(key)`：便捷判定 access 是否具某權限。
 * 用於「頁面該不該顯示管理者專屬 UI / 全體資料」；伺服器端各 action 仍以真實身分驗證權限，
 * 預覽只影響呈現，不會真的放大或縮小實際權限。
 */
export async function requireManageContext(): Promise<
  ActiveOrgContext & {
    canManage: boolean;
    previewing: boolean;
    access: ModuleAccess;
    previewRoleName?: string;
    can: (key: PermissionKey) => boolean;
  }
> {
  const ctx = await requireActiveOrg();
  const { access, previewing, previewRoleName } = await resolveAccess(ctx);
  const canManage = !previewing && canManageMembers(ctx.membership.role);
  return {
    ...ctx,
    canManage,
    previewing,
    access,
    previewRoleName,
    can: (key) => accessHas(access, key),
  };
}
