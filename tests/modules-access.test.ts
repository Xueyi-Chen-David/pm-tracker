/**
 * 模組可見性的三層閘門測試：組織已安裝 → 成員可見 → 具備權限。
 *
 * 這是權限相關的邏輯，錯了會讓人看到不該看的頁、或讓整間公司的側欄空掉，
 * 所以每一條語意都釘一則測試。canSeeModule 是純函式，安裝狀態由呼叫端
 * （server/org.ts 的 resolveAccess）查好後注入，這裡直接給定。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  canSeeModule,
  visibleModules,
  firstAllowedHref,
  getModule,
  isModuleKey,
  sanitizeInstallableModules,
  sanitizeVisibleModules,
  INSTALLABLE_MODULES,
  DEFAULT_INSTALLED_MODULES,
  MODULES,
  ROLE_VISIBLE_MODULES,
  groupedInstallableModules,
  type ModuleKey,
} from "../src/lib/modules";

/** 一個「什麼都裝了」的組織，用來單獨檢驗成員層的行為。 */
const ALL_INSTALLED = INSTALLABLE_MODULES.map((m) => m.key);

const owner = (installedModules: string[] = ALL_INSTALLED) => ({
  role: "OWNER" as const,
  isBoss: true,
  allowedModules: [] as string[],
  permissions: [] as string[],
  installedModules,
});

const member = (
  over: Partial<{
    allowedModules: string[];
    permissions: string[];
    installedModules: string[];
    isBoss: boolean;
  }> = {},
) => ({
  role: "MEMBER" as const,
  isBoss: over.isBoss ?? false,
  allowedModules: over.allowedModules ?? [],
  permissions: over.permissions ?? [],
  installedModules: over.installedModules ?? ALL_INSTALLED,
});

// ── 第一層：組織是否安裝 ────────────────────────────

test("組織沒安裝的模組，連 OWNER 都看不到", () => {
  const withoutCrm = ALL_INSTALLED.filter((k) => k !== "crm");
  assert.equal(canSeeModule(owner(withoutCrm), "crm"), false);
  assert.equal(canSeeModule(owner(), "crm"), true);
});

test("組織沒安裝時，老闆與一般成員也一樣看不到", () => {
  const none: string[] = [];
  assert.equal(canSeeModule(member({ installedModules: none, isBoss: true }), "crm"), false);
  assert.equal(canSeeModule(member({ installedModules: none }), "crm"), false);
});

test("core 模組不吃組織層閘門（什麼都沒裝也還在）", () => {
  const none: string[] = [];
  for (const key of ["dashboard", "daily", "todo", "checkin", "me"] as ModuleKey[]) {
    assert.equal(canSeeModule(member({ installedModules: none }), key), true, key);
  }
});

test("apps 一定要是 core：否則停用後就沒有地方能把它裝回來", () => {
  const apps = getModule("apps");
  assert.ok(apps);
  assert.equal(apps.core, true);
  assert.equal(apps.adminOnly, true);
  // core 模組不會出現在安裝清單裡（沒有「不裝」這個選項）
  assert.equal(
    INSTALLABLE_MODULES.some((m) => m.key === "apps"),
    false,
  );
});

test("停用（enabled=false）等同未安裝：呼叫端只把已啟用的 key 傳進來", () => {
  // resolveAccess 查詢時就帶了 enabled: true 條件，停用的模組不會出現在清單裡。
  const withoutFoodlabel = ALL_INSTALLED.filter((k) => k !== "foodlabel");
  assert.equal(canSeeModule(owner(withoutFoodlabel), "foodlabel"), false);
});

// ── 第二層：成員可見性 ──────────────────────────────

test("管理者 / 老闆對已安裝的一般模組一律可見", () => {
  assert.equal(canSeeModule(owner(), "projects"), true);
  assert.equal(canSeeModule(member({ isBoss: true }), "projects"), true);
});

test("allowedModules 為空＝可見全部一般模組", () => {
  assert.equal(canSeeModule(member(), "projects"), true);
  assert.equal(canSeeModule(member(), "crm"), true);
});

test("allowedModules 非空＝白名單，只看得到列出的", () => {
  const m = member({ allowedModules: ["crm"] });
  assert.equal(canSeeModule(m, "crm"), true);
  assert.equal(canSeeModule(m, "projects"), false);
});

test("白名單成員在模組安裝後仍看不到，要另外加進白名單", () => {
  // 這是既有語意，不是 bug；但很容易被誤會成「裝了卻沒生效」。
  const m = member({ allowedModules: ["crm"] });
  assert.equal(canSeeModule(m, "foodlabel"), false);
  assert.equal(canSeeModule(member({ allowedModules: ["crm", "foodlabel"] }), "foodlabel"), true);
});

test("adminOnly 模組：一般成員需被明確加選授權", () => {
  assert.equal(canSeeModule(member(), "apps"), false);
  assert.equal(canSeeModule(member({ allowedModules: ["apps"] }), "apps"), true);
});

test("加選 adminOnly 授權不會反過來縮限其他一般模組", () => {
  // allowedModules 只有 "apps" 時，一般模組的白名單其實是空的＝全開。
  const m = member({ allowedModules: ["apps"] });
  assert.equal(canSeeModule(m, "apps"), true);
  assert.equal(canSeeModule(m, "projects"), true);
});

// ── 第三層：權限 ────────────────────────────────────

test("requiresPermission 模組只看權限，不吃老闆 / 白名單捷徑", () => {
  assert.equal(canSeeModule(member({ isBoss: true }), "payroll"), false);
  assert.equal(canSeeModule(member({ allowedModules: ["payroll"] }), "payroll"), false);
  assert.equal(canSeeModule(member({ permissions: ["payroll.view"] }), "payroll"), true);
});

test("有權限但組織沒安裝，一樣看不到（組織層在最前面）", () => {
  const withoutPayroll = ALL_INSTALLED.filter((k) => k !== "payroll");
  assert.equal(
    canSeeModule(
      member({ permissions: ["payroll.view"], installedModules: withoutPayroll }),
      "payroll",
    ),
    false,
  );
});

// ── 清單與落腳頁 ────────────────────────────────────

test("visibleModules 依 MODULES 的順序回傳", () => {
  const keys = visibleModules(owner()).map((m) => m.key);
  const order = MODULES.map((m) => m.key).filter((k) => keys.includes(k));
  assert.deepEqual(keys, order);
});

test("firstAllowedHref 落在總覽，不會把人丟到設定頁", () => {
  assert.equal(firstAllowedHref(owner()), "/dashboard");
  // 連一個非 core 模組都沒裝時也還是總覽（dashboard 是 core）
  assert.equal(firstAllowedHref(owner([])), "/dashboard");
});

// ── 安裝清單的設定 ──────────────────────────────────

test("食品標示屬於垂直應用，預設不安裝", () => {
  assert.equal(DEFAULT_INSTALLED_MODULES.includes("foodlabel"), false);
  assert.equal(getModule("foodlabel")?.category, "垂直應用");
});

test("預設安裝清單涵蓋所有非垂直應用的可安裝模組", () => {
  const expected = INSTALLABLE_MODULES.filter((m) => m.category !== "垂直應用").map(
    (m) => m.key,
  );
  assert.deepEqual([...DEFAULT_INSTALLED_MODULES], expected);
});

test("sanitizeInstallableModules 擋掉未知與 core 的 key", () => {
  assert.deepEqual(sanitizeInstallableModules(["crm", "dashboard", "apps", "nope", "crm"]), [
    "crm",
  ]);
});

test("sanitizeVisibleModules 擋掉不可由角色控制的頁", () => {
  // 薪資走權限、apps 是 adminOnly、每日報告一律可見，三者都不該由角色白名單控制。
  assert.deepEqual(
    sanitizeVisibleModules(["crm", "payroll", "apps", "daily", "foodlabel"]),
    ["crm", "foodlabel"],
  );
});

test("每個可安裝模組都有說明與分類（安裝頁要顯示）", () => {
  for (const m of INSTALLABLE_MODULES) {
    assert.ok(m.description, `${m.key} 缺少 description`);
    assert.ok(m.category, `${m.key} 缺少 category`);
  }
});

test("groupedInstallableModules 不漏也不重複任何模組", () => {
  const flat = groupedInstallableModules().flatMap((g) => g.modules.map((m) => m.key));
  assert.deepEqual([...flat].sort(), INSTALLABLE_MODULES.map((m) => m.key).sort());
});

test("module key 沒有重複，isModuleKey 認得所有 key", () => {
  const keys = MODULES.map((m) => m.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.equal(isModuleKey(k), true);
  assert.equal(isModuleKey("not-a-module"), false);
});

test("角色可見頁面清單不含 core 之外的例外項", () => {
  for (const m of ROLE_VISIBLE_MODULES) {
    assert.equal(m.alwaysVisible, undefined, `${m.key} 不該可由角色控制`);
    assert.equal(m.adminOnly, undefined, `${m.key} 不該可由角色控制`);
    assert.equal(m.requiresPermission, undefined, `${m.key} 不該可由角色控制`);
  }
});
