/**
 * 應用模組（＝側欄各頁）與細分權限的單一真相來源。
 *
 * 權限語意：
 * - `alwaysVisible` 模組（每日報告 / 個人資料）：一律可見。
 * - `adminOnly` 模組：預設只有管理者(OWNER/ADMIN)或老闆可見；其他成員唯有被
 *   「加選授權」（key 列入 allowedModules）才看得到。（目前無 adminOnly 模組）
 * - 一般模組（含團隊 / 出席狀況）：`allowedModules` 的「一般部分」為空 → 可見全部一般模組
 *   （預設全開）；非空 → 只可見列出的一般模組。管理者 / 老闆一律可見全部。
 *   註：出席狀況雖人人可見，頁內的編輯 / 設定仍以 role 於各頁 canManage 控管。
 */
import type { OrgRole } from "@prisma/client";
import type { PermissionKey } from "@/lib/permissions";

export type ModuleKey =
  | "dashboard"
  | "daily"
  | "me"
  | "todo"
  | "projects"
  | "company"
  | "crm"
  | "timeline"
  | "team"
  | "attendance"
  | "payroll"
  | "training"
  | "meetings"
  | "report";

export type AppModule = {
  key: ModuleKey;
  label: string;
  href: string;
  /** 一律可見：不受 allowedModules 限制，也不列入權限勾選（如每個人都要寫的每日報告 / 個人資料）。 */
  alwaysVisible?: boolean;
  /** 管理者專屬：預設只有 OWNER/ADMIN/老闆可見；其他人需被額外授權（key 列入 allowedModules）。 */
  adminOnly?: boolean;
  /**
   * 權限專屬：只有具備此權限者可見（管理者因擁有全部權限故一律可見）。
   * 與 allowedModules 白名單無關——連老闆都需具備該權限才看得到（如薪資頁）。
   */
  requiresPermission?: PermissionKey;
};

/** 顯示順序＝側欄順序。firstAllowedHref 也依此順序挑第一個可見頁。 */
export const MODULES: readonly AppModule[] = [
  { key: "dashboard", label: "總覽", href: "/dashboard" },
  { key: "daily", label: "每日報告", href: "/daily", alwaysVisible: true },
  { key: "todo", label: "待辦 / 番茄鐘", href: "/todo", alwaysVisible: true },
  { key: "me", label: "個人資料", href: "/me", alwaysVisible: true },
  { key: "projects", label: "專案與任務", href: "/projects" },
  { key: "company", label: "公司OKR", href: "/company" },
  { key: "crm", label: "CRM", href: "/crm" },
  { key: "timeline", label: "時程藍圖", href: "/timeline" },
  { key: "team", label: "團隊", href: "/team" },
  { key: "attendance", label: "出席狀況", href: "/attendance" },
  {
    key: "payroll",
    label: "薪資",
    href: "/payroll",
    requiresPermission: "payroll.view",
  },
  { key: "training", label: "公司文件", href: "/training" },
  { key: "meetings", label: "會議記錄", href: "/meetings" },
  { key: "report", label: "週報", href: "/report" },
] as const;

export const MODULE_KEYS: readonly ModuleKey[] = MODULES.map((m) => m.key);

/** 可被細分權限（allowedModules）控制的模組——排除一律可見的。 */
export const GATED_MODULES: readonly AppModule[] = MODULES.filter(
  (m) => !m.alwaysVisible,
);

/** 一般（非管理者專屬）的可控模組——用「全部 / 白名單」語意。 */
export const GATED_NORMAL_MODULES: readonly AppModule[] = GATED_MODULES.filter(
  (m) => !m.adminOnly,
);

/** 管理者專屬模組——用「額外加選授權」語意（獨立於一般白名單）。 */
export const GATED_ADMIN_MODULES: readonly AppModule[] = GATED_MODULES.filter(
  (m) => m.adminOnly,
);

/**
 * 可由「自訂角色頁面可見性」控制的頁面：排除一律可見（每日 / 待辦 / 個人）、
 * 管理者專屬、以及需權限的頁（如薪資由 payroll.view 權限控管，不走頁面白名單）。
 * 角色編輯頁的「可見頁面」勾選清單即依此。
 */
export const ROLE_VISIBLE_MODULES: readonly AppModule[] = MODULES.filter(
  (m) => !m.alwaysVisible && !m.adminOnly && !m.requiresPermission,
);

const MODULE_BY_KEY = new Map(MODULES.map((m) => [m.key, m]));
const ADMIN_ONLY_KEYS = new Set<string>(GATED_ADMIN_MODULES.map((m) => m.key));
const ROLE_VISIBLE_MODULE_KEYS = new Set<string>(
  ROLE_VISIBLE_MODULES.map((m) => m.key),
);

/** 過濾出合法的「角色可見頁面」key（丟棄未知 / 不可由角色控制 / 重複），保留原順序。 */
export function sanitizeVisibleModules(keys: string[]): ModuleKey[] {
  const out: ModuleKey[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    if (ROLE_VISIBLE_MODULE_KEYS.has(k) && !seen.has(k)) {
      seen.add(k);
      out.push(k as ModuleKey);
    }
  }
  return out;
}

export function isModuleKey(v: string): v is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(v);
}

/** 是否為組織管理者（擁有者 / 管理員）。 */
export function isAdminRole(role?: OrgRole | null): boolean {
  return role === "OWNER" || role === "ADMIN";
}

type AccessInput = {
  isBoss?: boolean | null;
  allowedModules?: string[] | null;
  role?: OrgRole | null;
  /** 已解析的有效權限 key（管理者含全部）。供 requiresPermission 模組判定。 */
  permissions?: string[] | null;
};

/** 該成員能否看到某模組。 */
export function canSeeModule(user: AccessInput, key: ModuleKey): boolean {
  const mod = MODULE_BY_KEY.get(key);
  if (mod?.alwaysVisible) return true; // 一律可見
  if (mod?.requiresPermission) {
    // 權限專屬：只看有效權限（管理者的權限集合已含全部），不吃老闆 / 白名單捷徑。
    return (user.permissions ?? []).includes(mod.requiresPermission);
  }
  if (user.isBoss) return true; // 老闆一律全開
  if (isAdminRole(user.role)) return true; // 管理者一律全開
  const allowed = user.allowedModules ?? [];
  if (mod?.adminOnly) {
    // 管理者專屬：非管理者唯有被明確加選授權才看得到。
    return allowed.includes(key);
  }
  // 一般模組：只看 allowedModules 的「一般部分」（排除 adminOnly 授權，避免加選授權後反而擋掉其他頁）。
  const normalAllowed = allowed.filter((k) => !ADMIN_ONLY_KEYS.has(k));
  if (normalAllowed.length === 0) return true; // 空＝全部一般模組可見
  return normalAllowed.includes(key);
}

/** 該成員實際可見的模組清單（依 MODULES 順序）。 */
export function visibleModules(user: AccessInput): AppModule[] {
  return MODULES.filter((m) => canSeeModule(user, m.key));
}

/** 登入 / 被擋後的落腳頁：第一個可見模組，沒有則退回 /dashboard。 */
export function firstAllowedHref(user: AccessInput): string {
  return visibleModules(user)[0]?.href ?? "/dashboard";
}
