/**
 * 權限（Permission）的單一真相來源。
 *
 * 兩層權限模型（正交）：
 *  1. OrgRole（OWNER / ADMIN / MEMBER）＝「管理者」層：誰能管理組織、成員、角色與所有設定。
 *     管理者（OWNER / ADMIN）天生擁有**全部**權限，不受下列細分權限限制。
 *  2. 自訂角色（OrgRoleDef，如 人資 / 會計）＝「職能」層：授予一般成員特定的細分權限。
 *     一位成員可被指派多個角色，最終權限＝所有角色 permissions 的**聯集**。
 *
 * permissions 以字串 key 儲存（OrgRoleDef.permissions），非硬編碼列舉，方便日後擴充；
 * 未知 key 會被忽略（前後相容）。
 */

/** 權限 key。新增權限時同步更新此聯集與下方 PERMISSIONS 目錄。 */
export type PermissionKey =
  | "attendance.view_all"
  | "attendance.manage"
  | "leave.manage"
  | "payroll.view"
  | "payroll.manage";

export type PermissionDef = {
  key: PermissionKey;
  label: string;
  description: string;
  /** 分組（設定畫面用）。 */
  group: string;
};

/** 權限目錄（角色設定的勾選清單依此顯示，依 group 分組）。 */
export const PERMISSIONS: readonly PermissionDef[] = [
  {
    key: "attendance.view_all",
    label: "查看全體出勤",
    description: "看得到所有人的出席月曆與打卡紀錄（未授予者只能看自己的）。",
    group: "出勤差勤",
  },
  {
    key: "attendance.manage",
    label: "登記 / 修改全體出勤",
    description: "可替任何人登記或修改出席、請假、休假、出差，並管理出席追蹤與打卡設定。",
    group: "出勤差勤",
  },
  {
    key: "leave.manage",
    label: "管理假別與簽核流程",
    description:
      "可新增 / 編輯假別與其扣薪比例（特休、事假、病假…），並設定請假的簽核流程（由誰、依什麼順序簽核）與檢視全體請假。",
    group: "出勤差勤",
  },
  {
    key: "payroll.view",
    label: "查看薪資與薪資單",
    description: "可進入薪資頁，查看全體成員的薪資設定與每月薪資單。",
    group: "薪資",
  },
  {
    key: "payroll.manage",
    label: "管理薪資",
    description: "可編輯薪資設定、產生 / 核定每月薪資單。",
    group: "薪資",
  },
] as const;

export const PERMISSION_KEYS: readonly PermissionKey[] = PERMISSIONS.map(
  (p) => p.key,
);

const PERMISSION_KEY_SET = new Set<string>(PERMISSION_KEYS);

/** 依 group 分組後的權限目錄（設定畫面渲染用），保留 PERMISSIONS 的原始順序。 */
export function permissionsByGroup(): { group: string; items: PermissionDef[] }[] {
  const groups: { group: string; items: PermissionDef[] }[] = [];
  for (const p of PERMISSIONS) {
    let g = groups.find((x) => x.group === p.group);
    if (!g) {
      g = { group: p.group, items: [] };
      groups.push(g);
    }
    g.items.push(p);
  }
  return groups;
}

export function isPermissionKey(v: string): v is PermissionKey {
  return PERMISSION_KEY_SET.has(v);
}

/** 過濾出合法的權限 key（丟棄未知 / 重複）。角色 CRUD 存檔前用。 */
export function sanitizePermissions(keys: string[]): PermissionKey[] {
  const out: PermissionKey[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    if (isPermissionKey(k) && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

import type { OrgRole } from "@prisma/client";

/** 角色（自訂角色）的最小形狀：只需 permissions 陣列。 */
export type RoleDefLike = { permissions: string[] };

/** 權限判定所需的存取資訊。 */
export type PermissionAccess = {
  role: OrgRole;
  roleDefs?: RoleDefLike[] | null;
};

function isAdmin(role: OrgRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/** 該成員的有效權限集合（管理者＝全部；其餘＝所有已指派角色 permissions 的聯集）。 */
export function resolvePermissions(access: PermissionAccess): Set<PermissionKey> {
  if (isAdmin(access.role)) return new Set(PERMISSION_KEYS);
  const set = new Set<PermissionKey>();
  for (const r of access.roleDefs ?? []) {
    for (const k of r.permissions) {
      if (isPermissionKey(k)) set.add(k);
    }
  }
  return set;
}

/** 該成員是否具備某權限（管理者一律為 true）。 */
export function hasPermission(
  access: PermissionAccess,
  key: PermissionKey,
): boolean {
  if (isAdmin(access.role)) return true;
  for (const r of access.roleDefs ?? []) {
    if (r.permissions.includes(key)) return true;
  }
  return false;
}
