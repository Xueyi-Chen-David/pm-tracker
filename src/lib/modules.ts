/**
 * 應用模組（＝側欄各頁）與細分權限的單一真相來源。
 *
 * 三層模組模型：
 * - **平台層**：下方 MODULES＝這個版本存在哪些模組（程式碼決定）。
 * - **組織層**：OrganizationModule 資料表＝本組織安裝／啟用了哪些（OWNER/ADMIN 於
 *   「應用程式」頁管理，等同 Odoo 的 app install）。`core` 模組不吃這層，永遠可用。
 * - **成員層**：allowedModules / 角色 visibleModules / permissions＝誰看得到、能做什麼。
 * 三層是 AND 關係：組織沒安裝的模組，連 OWNER 都不會在側欄看到（他要去 /apps 安裝）。
 *
 * 權限語意：
 * - `alwaysVisible` 模組（每日報告 / 個人資料）：一律可見。
 * - `adminOnly` 模組：預設只有管理者(OWNER/ADMIN)或老闆可見；其他成員唯有被
 *   「加選授權」（key 列入 allowedModules）才看得到（如「應用程式」安裝頁）。
 * - 一般模組（含團隊）：`allowedModules` 的「一般部分」為空 → 可見全部一般模組
 *   （預設全開）；非空 → 只可見列出的一般模組。管理者 / 老闆一律可見全部。
 * - 出席狀況（attendance）現為 requiresPermission（attendance.view_all）：一般帳號在
 *   「打卡 / 請假 / 出差」頁已有自己的出勤月曆（我的出勤分頁），不需要側欄再多一個
 *   幾乎重複的入口；只有具「查看全體出勤」權限者才會在側欄看到「出席狀況」。
 */
import type { OrgRole } from "@prisma/client";
import type { PermissionKey } from "@/lib/permissions";

export type ModuleKey =
  | "apps"
  | "dashboard"
  | "daily"
  | "me"
  | "todo"
  | "checkin"
  | "projects"
  | "company"
  | "crm"
  | "timeline"
  | "team"
  | "hr"
  | "attendance"
  | "leave"
  | "payroll"
  | "training"
  | "meetings"
  | "report"
  | "foodlabel";

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
  /**
   * 核心模組：不經過「組織是否安裝」這層閘門，也不會出現在應用程式安裝清單。
   * 每個組織都需要的基礎頁（總覽 / 每日報告 / 個人 / 應用程式管理本身）屬於這類——
   * 尤其 apps 一定要是 core，否則把它停用之後就沒有地方可以裝回來了。
   */
  core?: boolean;
  /**
   * 相依模組：安裝本模組前，這些模組必須先安裝且啟用。
   * （例：日後若讓「食品標示」直接掛在 CRM 商機底下，就宣告 dependsOn: ["crm"]。）
   */
  dependsOn?: ModuleKey[];
  /** 應用程式頁的一句話說明。 */
  description?: string;
  /** 應用程式頁的分類標題。 */
  category?: string;
};

/** 顯示順序＝側欄順序。firstAllowedHref 也依此順序挑第一個可見頁。 */
export const MODULES: readonly AppModule[] = [
  {
    key: "dashboard",
    label: "總覽",
    href: "/dashboard",
    core: true,
    category: "基礎",
    description: "跨模組的整合首頁：待辦、專案進度、通知一次看完。",
  },
  {
    key: "daily",
    label: "每日報告",
    href: "/daily",
    alwaysVisible: true,
    core: true,
    category: "基礎",
    description: "每天寫一則工作紀錄，主管與協同主管可回饋。",
  },
  {
    key: "todo",
    label: "待辦 / 番茄鐘",
    href: "/todo",
    alwaysVisible: true,
    core: true,
    category: "基礎",
    description: "個人待辦清單與番茄鐘計時器（資料只有自己看得到）。",
  },
  // 打卡 / 請假 / 出差＝每個人自己的差勤自助頁（打卡、出勤月曆、請假、出差、補打卡），
  // 故 alwaysVisible（同每日報告 / 待辦）。企業沒開打卡時仍可看月曆 / 請假 / 登記出差。
  {
    key: "checkin",
    label: "打卡 / 請假 / 出差",
    href: "/checkin",
    alwaysVisible: true,
    core: true,
    category: "基礎",
    description: "個人差勤自助：打卡、出勤月曆、請假與出差申請、補打卡。",
  },
  {
    key: "me",
    label: "個人資料",
    href: "/me",
    alwaysVisible: true,
    core: true,
    category: "基礎",
    description: "自己的基本資料、頭像與工作描述。",
  },
  {
    key: "projects",
    label: "專案與任務",
    href: "/projects",
    category: "目標與專案",
    description: "常態 / 專案 / 一次性任務的追蹤、里程碑與週更新。",
  },
  {
    key: "company",
    label: "公司OKR",
    href: "/company",
    category: "目標與專案",
    description: "組織願景與年度 / 季度 OKR，向下對齊到個人目標。",
  },
  {
    key: "crm",
    label: "CRM",
    href: "/crm",
    category: "業務",
    description: "客戶、聯絡人、商機看板與業務開發信件追蹤。",
  },
  {
    key: "timeline",
    label: "時程藍圖",
    href: "/timeline",
    category: "目標與專案",
    description: "所有專案與里程碑的甘特式時程總覽。",
  },
  {
    key: "team",
    label: "團隊",
    href: "/team",
    category: "團隊協作",
    description: "成員名單、組織架構圖與自訂角色設定。",
  },
  {
    key: "hr",
    label: "人事",
    href: "/hr",
    requiresPermission: "hr.view",
    category: "人資 / 會計",
    description: "任職資料、職務異動與角色權限指派（需人事權限）。",
  },
  // 一般帳號已經有「打卡 / 請假 / 出差」頁的「我的出勤」分頁可看自己的出勤，
  // 側欄這個全體出勤檢視 / 管理頁只給有「查看全體出勤」權限的人（人資 / 管理者）。
  {
    key: "attendance",
    label: "出席狀況",
    href: "/attendance",
    requiresPermission: "attendance.view_all",
    category: "人資 / 會計",
    description: "全體出勤月曆與打卡設定（需查看全體出勤權限）。",
  },
  // 請假簽核＝只給「要簽核的人」：送出自己的請假已搬到「打卡 / 請假 / 出差」。
  // leave.manage（HR / 管理者）由 requiresPermission 靜態放行；被排進簽核流程但沒有
  // 該權限的一般成員是 DB 決定的，靜態算不出來——由 app/layout.tsx 動態補上（見該處）。
  {
    key: "leave",
    label: "請假簽核",
    href: "/leave",
    requiresPermission: "leave.manage",
    category: "人資 / 會計",
    description: "請假 / 出差的多關簽核流程與假別設定。",
  },
  {
    key: "payroll",
    label: "薪資",
    href: "/payroll",
    requiresPermission: "payroll.view",
    category: "人資 / 會計",
    description: "薪資設定、勞健保級距與每月薪資單（需薪資權限）。",
  },
  {
    key: "training",
    label: "公司文件",
    href: "/training",
    category: "團隊協作",
    description: "公司知識庫與教育訓練文件，可指派課程給成員。",
  },
  {
    key: "meetings",
    label: "會議記錄",
    href: "/meetings",
    category: "團隊協作",
    description: "會議記錄與決議追蹤。",
  },
  {
    key: "report",
    label: "週報",
    href: "/report",
    category: "團隊協作",
    description: "每週彙整報告，可輸出圖片給老闆 / 客戶。",
  },
  {
    key: "foodlabel",
    label: "食品標示",
    href: "/foodlabel",
    category: "垂直應用",
    description:
      "日本食品輸台合規：把日本「栄養成分表示」轉換為台灣營養標示，並列出強制項目的缺口。",
  },
  // 應用程式安裝頁本身：必須 core（否則停用後就沒有地方能把它裝回來），
  // 且 adminOnly（一般成員看不到；真有需要可用 allowedModules 個別加選授權）。
  // 放在陣列最後：firstAllowedHref 取第一個可見模組，不該把人丟到設定頁。
  {
    key: "apps",
    label: "應用程式",
    href: "/apps",
    adminOnly: true,
    core: true,
    category: "設定",
    description: "安裝 / 停用本組織要使用的應用程式模組。",
  },
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

/**
 * 可由組織安裝 / 停用的模組（＝非 core）。「應用程式」頁的清單依此。
 * core 模組不列入：它們是每個組織的基礎，沒有「不裝」這個選項。
 */
export const INSTALLABLE_MODULES: readonly AppModule[] = MODULES.filter(
  (m) => !m.core,
);

/** 預設安裝清單：新組織建立時自動安裝的模組。垂直應用（如食品標示）預設不裝。 */
export const DEFAULT_INSTALLED_MODULES: readonly ModuleKey[] =
  INSTALLABLE_MODULES.filter((m) => m.category !== "垂直應用").map((m) => m.key);

/** 過濾出合法的「可安裝模組」key（丟棄未知 / core / 重複）。 */
export function sanitizeInstallableModules(keys: string[]): ModuleKey[] {
  const installable = new Set<string>(INSTALLABLE_MODULES.map((m) => m.key));
  const out: ModuleKey[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    if (installable.has(k) && !seen.has(k)) {
      seen.add(k);
      out.push(k as ModuleKey);
    }
  }
  return out;
}

/** 依 category 分組的可安裝模組（應用程式頁渲染用），保留 MODULES 原始順序。 */
export function groupedInstallableModules(): Array<{
  category: string;
  modules: AppModule[];
}> {
  const groups: Array<{ category: string; modules: AppModule[] }> = [];
  for (const m of INSTALLABLE_MODULES) {
    const category = m.category ?? "其他";
    const found = groups.find((g) => g.category === category);
    if (found) found.modules.push(m);
    else groups.push({ category, modules: [m] });
  }
  return groups;
}

export function getModule(key: ModuleKey): AppModule | undefined {
  return MODULE_BY_KEY.get(key);
}

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
  /**
   * 本組織已安裝且已啟用的模組 key（組織層閘門）。**必填**——型別上強制每個建構
   * ModuleAccess 的地方都要帶，避免有人忘了帶而讓整個閘門靜默失效。
   * core 模組不受此限制。
   */
  installedModules: string[];
};

/** 該成員能否看到某模組。三層閘門：組織已安裝 → 成員可見 → 具備權限。 */
export function canSeeModule(user: AccessInput, key: ModuleKey): boolean {
  const mod = MODULE_BY_KEY.get(key);
  if (!mod) return false;
  // ① 組織層：本組織沒安裝（或已停用）的模組，任何人都看不到——**包含 OWNER**。
  //    管理者要用它，得先去「應用程式」頁安裝；這樣「側欄有沒有這一頁」才會跟
  //    「公司有沒有買 / 開這個模組」是同一件事，而不是各人權限拼湊出來的結果。
  if (!mod.core && !user.installedModules.includes(key)) return false;
  if (mod.alwaysVisible) return true; // 一律可見
  if (mod.requiresPermission) {
    // 權限專屬：只看有效權限（管理者的權限集合已含全部），不吃老闆 / 白名單捷徑。
    return (user.permissions ?? []).includes(mod.requiresPermission);
  }
  if (user.isBoss) return true; // 老闆一律全開
  if (isAdminRole(user.role)) return true; // 管理者一律全開
  const allowed = user.allowedModules ?? [];
  if (mod.adminOnly) {
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
