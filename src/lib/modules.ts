/**
 * 應用模組（＝側欄各頁）與細分權限的單一真相來源。
 *
 * 權限語意：
 * - `User.allowedModules` 為空陣列 → 可見「全部」模組（維持既有預設行為，沒設定＝全開）。
 * - 非空 → 只可見列出的 key。
 * - `isBoss` 的成員一律可見全部（不受 allowedModules 限制）。
 */

export type ModuleKey =
  | "dashboard"
  | "projects"
  | "timeline"
  | "team"
  | "attendance"
  | "meetings"
  | "report";

export type AppModule = {
  key: ModuleKey;
  label: string;
  href: string;
};

/** 顯示順序＝側欄順序。firstAllowedHref 也依此順序挑第一個可見頁。 */
export const MODULES: readonly AppModule[] = [
  { key: "dashboard", label: "總覽", href: "/dashboard" },
  { key: "projects", label: "專案與任務", href: "/projects" },
  { key: "timeline", label: "時程藍圖", href: "/timeline" },
  { key: "team", label: "團隊", href: "/team" },
  { key: "attendance", label: "出席狀況", href: "/attendance" },
  { key: "meetings", label: "會議記錄", href: "/meetings" },
  { key: "report", label: "週報", href: "/report" },
] as const;

export const MODULE_KEYS: readonly ModuleKey[] = MODULES.map((m) => m.key);

export function isModuleKey(v: string): v is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(v);
}

type AccessInput = {
  isBoss?: boolean | null;
  allowedModules?: string[] | null;
};

/** 該成員能否看到某模組。 */
export function canSeeModule(user: AccessInput, key: ModuleKey): boolean {
  if (user.isBoss) return true;
  const allowed = user.allowedModules ?? [];
  if (allowed.length === 0) return true; // 空＝全部可見
  return allowed.includes(key);
}

/** 該成員實際可見的模組清單（依 MODULES 順序）。 */
export function visibleModules(user: AccessInput): AppModule[] {
  return MODULES.filter((m) => canSeeModule(user, m.key));
}

/** 登入 / 被擋後的落腳頁：第一個可見模組，沒有則退回 /dashboard。 */
export function firstAllowedHref(user: AccessInput): string {
  return visibleModules(user)[0]?.href ?? "/dashboard";
}
