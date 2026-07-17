"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Calculator,
  Pencil,
  RefreshCw,
  Trash2,
  Check,
  X,
  Plus,
  Download,
  Sparkles,
  Gift,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  computePayslip,
  computeAllPayslips,
  upsertSalaryProfile,
  setPayslipStatus,
  deletePayslip,
  addPayslipAdjustment,
  deletePayslipAdjustment,
} from "@/server/actions/payroll";
import type {
  PayrollMember,
  OrgLeaveType,
  PayrollSettingRow,
  SalaryItemDefRow,
} from "@/server/queries";
import { parseMemberItems } from "@/lib/salary-items";
import { displayName } from "@/lib/display";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { LeaveTypesManager } from "@/components/leave-types-manager";
import { PayrollSettingsPanel } from "@/components/payroll-settings-panel";
import { SalaryItemsManager } from "@/components/salary-items-manager";

type Line = { name: string; amount: number };
type BreakdownLine = { label: string; amount: number };

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function toLines(v: unknown): Line[] {
  if (!Array.isArray(v)) return [];
  const out: Line[] = [];
  for (const item of v) {
    if (item && typeof item === "object") {
      const name = String((item as Record<string, unknown>).name ?? "").trim();
      const amount = Number((item as Record<string, unknown>).amount);
      if (name && Number.isFinite(amount)) out.push({ name, amount });
    }
  }
  return out;
}

const PAY_TYPE_LABEL: Record<string, string> = {
  MONTHLY: "月薪",
  HOURLY: "時薪",
};

/** 薪資單表尾：Σ應發 / Σ代扣 / Σ實發 / Σ公司負擔 + 當月公司總成本。 */
function PayrollTotals({ members }: { members: PayrollMember[] }) {
  const slips = members
    .map((m) => m.payslip)
    .filter((p): p is NonNullable<PayrollMember["payslip"]> => Boolean(p));
  if (slips.length === 0) return null;
  const gross = slips.reduce((a, p) => a + p.grossPay, 0);
  const ded = slips.reduce((a, p) => a + p.deductionTotal, 0);
  const net = slips.reduce((a, p) => a + p.netPay, 0);
  const employer = slips.reduce((a, p) => a + p.employerCostTotal, 0);
  return (
    <tfoot className="bg-muted/30 border-t text-sm font-medium">
      <tr>
        <td className="px-3 py-2" colSpan={2}>
          合計（{slips.length} 張）
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{fmt(gross)}</td>
        <td className="px-3 py-2 text-right tabular-nums text-rose-600">
          -{fmt(ded)}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{fmt(net)}</td>
        <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
          {fmt(employer)}
        </td>
        <td colSpan={2} />
      </tr>
      <tr className="border-t">
        <td colSpan={8} className="px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              當月公司總薪資成本（Σ應發 ＋ Σ公司負擔）
            </span>
            <span className="text-base font-bold tabular-nums">
              {fmt(gross + employer)}
            </span>
          </div>
        </td>
      </tr>
    </tfoot>
  );
}

function csvCell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 匯出當月薪資清冊 CSV（含員工自付與公司負擔明細；Excel 相容 BOM）。 */
function exportPayrollCsv(
  members: PayrollMember[],
  year: number,
  month: number,
) {
  const header = [
    "成員", "制別", "投保薪資", "應發", "應稅所得",
    "勞保自付", "健保自付", "勞退自提", "二代健保自付", "扣繳稅", "代扣合計", "實發",
    "勞保雇主", "健保雇主", "勞退雇主", "職災", "二代健保雇主", "公司負擔", "狀態",
  ];
  const rows = members
    .filter((m) => m.payslip)
    .map((m) => {
      const p = m.payslip!;
      return [
        displayName(m),
        PAY_TYPE_LABEL[p.payType] ?? p.payType,
        p.insuredSalary, p.grossPay, p.taxableIncome,
        p.laborInsEmployee, p.healthInsEmployee, p.pensionSelfEmployee,
        p.supplementaryEmployee, p.incomeTaxWithheld, p.deductionTotal, p.netPay,
        p.laborInsEmployer, p.healthInsEmployer, p.pensionEmployer,
        p.occupationalEmployer, p.supplementaryEmployer, p.employerCostTotal,
        p.status === "finalized" ? "已核定" : "草稿",
      ];
    });
  if (rows.length === 0) {
    toast.error("尚無薪資單可匯出，請先產生薪資單");
    return;
  }
  const csv = [header, ...rows]
    .map((r) => r.map(csvCell).join(","))
    .join("\r\n");
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `payroll-${year}-${String(month).padStart(2, "0")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type Tab = "payslips" | "salary" | "items" | "settings" | "leave";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
/** pageSize === 0 表示「全部」，不分頁。 */
const DEFAULT_PAGE_SIZE = 20;

/**
 * 成員一多，表格就用分頁 + 可調每頁人數；表格容器高度固定（h-[60vh]），超過內部捲動
 * （表頭 sticky），所以表格框框的下緣位置固定。分頁列就是一般表格下方的普通內容列（非固定定位）。
 */
function MemberPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
}) {
  if (total === 0) return null;
  const effectiveSize = pageSize === 0 ? total : pageSize;
  const totalPages = Math.max(1, Math.ceil(total / effectiveSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <div className="text-muted-foreground flex items-center gap-2">
        <span>每頁</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="border-input bg-transparent dark:bg-input/30 h-8 rounded-md border px-2 text-sm outline-none"
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} 人
            </option>
          ))}
          <option value={0}>全部</option>
        </select>
        <span>共 {total} 位</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          上一頁
        </Button>
        <span className="text-muted-foreground tabular-nums">
          第 {page} / {totalPages} 頁
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          下一頁
        </Button>
      </div>
    </div>
  );
}

export function PayrollWorkspace({
  members,
  leaveTypes,
  setting,
  brackets,
  salaryItems,
  canManage,
  canManageLeave,
  year,
  month,
}: {
  members: PayrollMember[];
  leaveTypes: OrgLeaveType[];
  setting: PayrollSettingRow;
  brackets: number[];
  salaryItems: SalaryItemDefRow[];
  canManage: boolean;
  canManageLeave: boolean;
  year: number;
  month: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("payslips");
  const [editing, setEditing] = useState<PayrollMember | null>(null);
  const [viewing, setViewing] = useState<PayrollMember | null>(null);
  const [pending, start] = useTransition();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // 換月份時人數可能不同（到職/離職），回到第一頁避免停在一個空頁（渲染期間調整衍生狀態，不用 effect）。
  const monthKey = `${year}-${month}`;
  const [prevMonthKey, setPrevMonthKey] = useState(monthKey);
  if (monthKey !== prevMonthKey) {
    setPrevMonthKey(monthKey);
    setPage(1);
  }

  const withSalary = members.filter((m) => m.salary);

  const effectivePageSize = pageSize === 0 ? Math.max(members.length, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(members.length / effectivePageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * effectivePageSize;
  const pagedMembers = members.slice(pageStart, pageStart + effectivePageSize);

  function changePageSize(n: number) {
    setPageSize(n);
    setPage(1);
  }

  function computeAll() {
    start(async () => {
      try {
        const res = await computeAllPayslips({ year, month });
        toast.success(`已產生 ${res.count} 位成員的薪資單`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "產生失敗");
      }
    });
  }

  function exportCsv() {
    exportPayrollCsv(members, year, month);
  }

  return (
    <div className="space-y-4">
      {/* 分頁 */}
      <div className="flex items-center gap-1 overflow-x-auto border-b">
        <TabButton active={tab === "payslips"} onClick={() => setTab("payslips")}>
          薪資單
        </TabButton>
        {canManage && (
          <TabButton active={tab === "salary"} onClick={() => setTab("salary")}>
            薪資設定
          </TabButton>
        )}
        {canManage && (
          <TabButton active={tab === "items"} onClick={() => setTab("items")}>
            薪資科目
          </TabButton>
        )}
        {canManage && (
          <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>
            勞健保設定
          </TabButton>
        )}
        <TabButton active={tab === "leave"} onClick={() => setTab("leave")}>
          假別
        </TabButton>
      </div>

      {tab === "payslips" && (
        <div className="space-y-3">
          {canManage && !setting && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm">
              <span className="text-amber-800">
                尚未設定勞健保費率與投保級距，薪資單暫時只計本薪 / 加給 / 加班。
                到「勞健保設定」一鍵帶入 2026 法定預設即可自動計算勞保 / 健保 / 勞退。
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setTab("settings")}
                className="gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" /> 前往設定
              </Button>
            </div>
          )}
          {canManage && withSalary.length > 0 && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={exportCsv} className="gap-1.5">
                <Download className="h-4 w-4" /> 匯出薪資清冊 CSV
              </Button>
              <Button onClick={computeAll} disabled={pending} className="gap-1.5">
                <Calculator className="h-4 w-4" /> 產生 / 重算全部（{year}/{month}）
              </Button>
            </div>
          )}
          <div className="h-[60vh] overflow-y-auto overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground sticky top-0 z-10 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">成員</th>
                  <th className="px-3 py-2 text-left font-medium">制別</th>
                  <th className="px-3 py-2 text-right font-medium">應發</th>
                  <th className="px-3 py-2 text-right font-medium">代扣</th>
                  <th className="px-3 py-2 text-right font-medium">實發</th>
                  <th className="px-3 py-2 text-right font-medium">公司負擔</th>
                  <th className="px-3 py-2 text-center font-medium">狀態</th>
                  <th className="px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {pagedMembers.map((m) => (
                  <PayslipRow
                    key={m.membershipId}
                    m={m}
                    year={year}
                    month={month}
                    canManage={canManage}
                    salaryItems={salaryItems}
                    onView={() => setViewing(m)}
                    onSetup={() => setEditing(m)}
                  />
                ))}
              </tbody>
              <PayrollTotals members={members} />
            </table>
          </div>
          <MemberPagination
            page={safePage}
            pageSize={pageSize}
            total={members.length}
            onPageChange={setPage}
            onPageSizeChange={changePageSize}
          />
          <p className="text-muted-foreground text-xs">
            薪資單依當月出席紀錄（出勤 / 請假各假別 / 缺勤）與打卡工時，套用各成員薪資設定即時計算。
            「代扣」＝勞健保自付＋勞退自提＋固定扣除；「公司負擔」＝勞健保雇主＋勞退6%＋職災＋二代健保（不含應發）。
            當月總成本 ＝ Σ實發 ＋ Σ代扣 ＋ Σ公司負擔。調整出勤或設定後按「重算」更新。
          </p>
        </div>
      )}

      {tab === "salary" && canManage && (
        <div className="space-y-3">
          <div className="h-[60vh] overflow-y-auto overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground sticky top-0 z-10 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">成員</th>
                  <th className="px-3 py-2 text-left font-medium">制別</th>
                  <th className="px-3 py-2 text-right font-medium">底薪</th>
                  <th className="px-3 py-2 text-right font-medium">加給 / 扣除</th>
                  <th className="px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {pagedMembers.map((m) => (
                  <tr key={m.membershipId} className="hover:bg-muted/30 border-t">
                    <td className="px-3 py-2">{displayName(m)}</td>
                    <td className="px-3 py-2">
                      {m.salary ? PAY_TYPE_LABEL[m.salary.payType] ?? m.salary.payType : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {m.salary
                        ? `${fmt(m.salary.baseAmount)} ${m.salary.currency}${m.salary.payType === "HOURLY" ? " /時" : " /月"}`
                        : <span className="text-muted-foreground">未設定</span>}
                    </td>
                    <td className="text-muted-foreground px-3 py-2 text-right text-xs">
                      {m.salary
                        ? `+${toLines(m.salary.allowances).length} / -${toLines(m.salary.deductions).length}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(m)}
                        className="gap-1"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {m.salary ? "編輯" : "設定"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <MemberPagination
            page={safePage}
            pageSize={pageSize}
            total={members.length}
            onPageChange={setPage}
            onPageSizeChange={changePageSize}
          />
        </div>
      )}

      {tab === "items" && canManage && (
        <SalaryItemsManager items={salaryItems} canManage={canManage} />
      )}

      {tab === "settings" && canManage && (
        <PayrollSettingsPanel
          setting={setting}
          brackets={brackets}
          canManage={canManage}
        />
      )}

      {tab === "leave" && (
        <LeaveTypesManager leaveTypes={leaveTypes} canManage={canManageLeave} />
      )}

      {editing && (
        <SalaryEditor
          key={editing.membershipId}
          member={editing}
          salaryItems={salaryItems}
          onClose={() => setEditing(null)}
        />
      )}
      {viewing && viewing.payslip && (
        <PayslipDialog member={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "text-muted-foreground hover:text-foreground border-transparent",
      )}
    >
      {children}
    </button>
  );
}

function PayslipRow({
  m,
  year,
  month,
  canManage,
  salaryItems,
  onView,
  onSetup,
}: {
  m: PayrollMember;
  year: number;
  month: number;
  canManage: boolean;
  salaryItems: SalaryItemDefRow[];
  onView: () => void;
  onSetup: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showAdj, setShowAdj] = useState(false);
  const ps = m.payslip;
  const adjCount = m.adjustments.length;

  function compute() {
    start(async () => {
      try {
        await computePayslip({ memberId: m.membershipId, year, month });
        toast.success("已產生薪資單");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "產生失敗");
      }
    });
  }

  function toggleFinal() {
    if (!ps) return;
    start(async () => {
      try {
        await setPayslipStatus(ps.id, ps.status !== "finalized");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "更新失敗");
      }
    });
  }

  function remove() {
    if (!ps) return;
    if (!confirm("確定刪除這張薪資單？")) return;
    start(async () => {
      try {
        await deletePayslip(ps.id);
        toast.success("已刪除");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "刪除失敗");
      }
    });
  }

  return (
    <Fragment>
    <tr className="hover:bg-muted/30 border-t">
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          {canManage && m.salary && (
            <button
              type="button"
              onClick={() => setShowAdj((v) => !v)}
              title="當月獎金 / 調整"
              className="text-muted-foreground hover:text-foreground -ml-1 rounded p-0.5"
            >
              {showAdj ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          <span>{displayName(m)}</span>
          {adjCount > 0 && (
            <span
              title={`${adjCount} 筆當月獎金 / 調整`}
              className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 px-1.5 text-[10px] font-medium text-violet-700"
            >
              <Gift className="h-3 w-3" />
              {adjCount}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        {m.salary ? PAY_TYPE_LABEL[m.salary.payType] ?? m.salary.payType : "—"}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {ps ? fmt(ps.grossPay) : "—"}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-rose-600">
        {ps ? (ps.deductionTotal > 0 ? `-${fmt(ps.deductionTotal)}` : "0") : "—"}
      </td>
      <td className="px-3 py-2 text-right font-medium tabular-nums">
        {ps ? fmt(ps.netPay) : "—"}
      </td>
      <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
        {ps ? fmt(ps.employerCostTotal) : "—"}
      </td>
      <td className="px-3 py-2 text-center">
        {!m.salary ? (
          <span className="text-muted-foreground text-xs">未設定薪資</span>
        ) : !ps ? (
          <span className="text-muted-foreground text-xs">尚未產生</span>
        ) : ps.status === "finalized" ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            已核定
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
            草稿
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1">
          {!m.salary ? (
            canManage && (
              <Button variant="outline" size="sm" onClick={onSetup}>
                設定薪資
              </Button>
            )
          ) : (
            <>
              {ps && (
                <Button variant="ghost" size="sm" onClick={onView}>
                  明細
                </Button>
              )}
              {canManage && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowAdj((v) => !v)}
                    title="當月獎金 / 調整"
                    className={cn(
                      "hover:bg-muted rounded p-1.5",
                      showAdj && "bg-muted text-violet-600",
                    )}
                  >
                    <Gift className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={compute}
                    disabled={pending}
                    title={ps ? "重算" : "產生"}
                    className="hover:bg-muted rounded p-1.5 disabled:opacity-50"
                  >
                    {ps ? (
                      <RefreshCw className="h-3.5 w-3.5" />
                    ) : (
                      <Calculator className="h-4 w-4" />
                    )}
                  </button>
                  {ps && (
                    <>
                      <button
                        type="button"
                        onClick={toggleFinal}
                        disabled={pending}
                        title={ps.status === "finalized" ? "改回草稿" : "核定"}
                        className="hover:bg-muted rounded p-1.5 disabled:opacity-50"
                      >
                        {ps.status === "finalized" ? (
                          <X className="h-3.5 w-3.5" />
                        ) : (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={remove}
                        disabled={pending}
                        title="刪除"
                        className="hover:bg-muted rounded p-1.5 text-rose-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
    {showAdj && (
      <tr>
        <td colSpan={8} className="bg-muted/20 border-t px-4 py-3">
          <AdjustmentPanel
            m={m}
            year={year}
            month={month}
            salaryItems={salaryItems}
          />
        </td>
      </tr>
    )}
    </Fragment>
  );
}

/** 當月獎金 / 調整面板：列出本月調整 + 新增表單（可選科目帶旗標，或自訂一筆）。 */
function AdjustmentPanel({
  m,
  year,
  month,
  salaryItems,
}: {
  m: PayrollMember;
  year: number;
  month: number;
  salaryItems: SalaryItemDefRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [defId, setDefId] = useState(""); // "" ＝ 自訂
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"EARNING" | "DEDUCTION">("EARNING");
  const [amount, setAmount] = useState("");

  const activeItems = salaryItems.filter((d) => d.active);

  function pickDef(id: string) {
    setDefId(id);
    const def = salaryItems.find((d) => d.id === id);
    if (def) {
      setLabel(def.name);
      setKind(def.kind === "DEDUCTION" ? "DEDUCTION" : "EARNING");
    }
  }

  function add() {
    const amt = Number(amount);
    if (!label.trim()) {
      toast.error("請輸入名稱");
      return;
    }
    if (!(amt > 0)) {
      toast.error("金額需大於 0");
      return;
    }
    const def = defId ? salaryItems.find((d) => d.id === defId) : undefined;
    start(async () => {
      try {
        await addPayslipAdjustment({
          memberId: m.membershipId,
          year,
          month,
          label: label.trim(),
          kind,
          amount: amt,
          // 選科目 → 沿用科目旗標；自訂 → 預設「應稅獎金、不計投保、非經常性」。
          taxable: def ? def.taxable : true,
          countsToInsurance: def ? def.countsToInsurance : false,
          recurring: def ? def.recurring : false,
          taxFreeLimit: def?.taxFreeLimit ?? null,
          sourceDefId: def?.id ?? null,
        });
        toast.success("已加入當月獎金 / 調整並重算");
        setDefId("");
        setLabel("");
        setKind("EARNING");
        setAmount("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "新增失敗");
      }
    });
  }

  function remove(id: string) {
    if (!confirm("刪除這筆當月獎金 / 調整？將重算薪資單。")) return;
    start(async () => {
      try {
        await deletePayslipAdjustment(id);
        toast.success("已刪除並重算");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "刪除失敗");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Gift className="h-3.5 w-3.5" /> 當月獎金 / 調整（{year}/{month}）
      </div>
      <p className="text-muted-foreground text-[11px]">
        只影響本月、不進常駐薪資設定，發完即結束。三節 / 年終 / 績效 / 臨時獎金請用這裡；
        非經常性獎金會自動併入二代健保高額獎金累計。
      </p>

      {/* 現有清單 */}
      {m.adjustments.length > 0 && (
        <div className="divide-y rounded-md border bg-background">
          {m.adjustments.map((a) => (
            <div key={a.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 text-[10px] font-medium",
                  a.kind === "DEDUCTION"
                    ? "bg-rose-100 text-rose-700"
                    : "bg-emerald-100 text-emerald-700",
                )}
              >
                {a.kind === "DEDUCTION" ? "減項" : "加項"}
              </span>
              <span className="min-w-0 flex-1 truncate">{a.label}</span>
              {!a.recurring && a.kind === "EARNING" && (
                <span className="text-muted-foreground shrink-0 text-[10px]">獎金</span>
              )}
              <span
                className={cn(
                  "shrink-0 tabular-nums",
                  a.kind === "DEDUCTION" ? "text-rose-600" : "",
                )}
              >
                {a.kind === "DEDUCTION" ? "-" : "+"}
                {fmt(a.amount)}
              </span>
              <button
                type="button"
                onClick={() => remove(a.id)}
                disabled={pending}
                title="刪除"
                className="hover:bg-muted shrink-0 rounded p-1 text-rose-600 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 新增一筆 */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label className="text-muted-foreground text-[11px]">科目（選填）</label>
          <select
            value={defId}
            onChange={(e) => pickDef(e.target.value)}
            className="border-input bg-transparent dark:bg-input/30 h-9 rounded-md border px-2 text-sm outline-none"
          >
            <option value="">自訂（應稅獎金）</option>
            {activeItems.map((d) => (
              <option key={d.id} value={d.id}>
                {d.kind === "EARNING" ? "＋" : "－"} {d.name}
                {d.recurring ? "" : "（獎金）"}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-muted-foreground text-[11px]">名稱</label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="例：三節獎金（端午）"
            className="h-9 w-44"
          />
        </div>
        <div className="space-y-1">
          <label className="text-muted-foreground text-[11px]">類別</label>
          <div className="flex h-9 items-center gap-1 rounded-md border p-0.5">
            {(["EARNING", "DEDUCTION"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                disabled={defId !== ""}
                className={cn(
                  "rounded px-2 py-1 text-xs font-medium disabled:opacity-50",
                  kind === k
                    ? k === "DEDUCTION"
                      ? "bg-rose-100 text-rose-700"
                      : "bg-emerald-100 text-emerald-700"
                    : "text-muted-foreground",
                )}
              >
                {k === "DEDUCTION" ? "減項" : "加項"}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-muted-foreground text-[11px]">金額</label>
          <Input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="金額"
            className="h-9 w-28"
          />
        </div>
        <Button size="sm" disabled={pending} onClick={add} className="gap-1">
          <Plus className="h-4 w-4" /> 加入
        </Button>
      </div>
    </div>
  );
}

function PayslipDialog({
  member,
  onClose,
}: {
  member: PayrollMember;
  onClose: () => void;
}) {
  const ps = member.payslip!;
  const lines = (Array.isArray(ps.breakdown) ? ps.breakdown : []) as BreakdownLine[];
  const earnings = lines.filter((l) => l.amount >= 0);
  const deductions = lines.filter((l) => l.amount < 0);
  const employer: BreakdownLine[] = [
    { label: "勞保雇主負擔", amount: ps.laborInsEmployer },
    { label: "健保雇主負擔", amount: ps.healthInsEmployer },
    { label: "勞退雇主提繳（6%）", amount: ps.pensionEmployer },
    { label: "職災保險", amount: ps.occupationalEmployer },
    { label: "二代健保補充保費", amount: ps.supplementaryEmployer },
  ].filter((l) => l.amount > 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>薪資單 · {displayName(member)}</DialogTitle>
          <DialogDescription>
            {ps.payType === "HOURLY" ? "時薪制" : "月薪制"} ·{" "}
            出勤 {ps.workedDays} 天 · 請假 {ps.leaveDays} 天 · 缺勤 {ps.absentDays} 天
            {ps.overtimeHours > 0 && ` · 加班 ${ps.overtimeHours} 小時`}
            {ps.insuredSalary > 0 && ` · 投保 ${fmt(ps.insuredSalary)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {/* 應發 */}
          <Section title="應發項目">
            {earnings.map((l, i) => (
              <Row key={i} label={l.label} amount={l.amount} />
            ))}
            <Row label="應發合計" amount={ps.grossPay} bold />
          </Section>

          {/* 應扣 */}
          <Section title="應扣項目">
            {deductions.length === 0 ? (
              <p className="text-muted-foreground py-1 text-xs">（無）</p>
            ) : (
              deductions.map((l, i) => (
                <Row key={i} label={l.label} amount={l.amount} />
              ))
            )}
            <Row label="應扣合計" amount={-ps.deductionTotal} bold />
          </Section>

          {/* 實發 */}
          <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2.5 text-base font-bold">
            <span>實發金額</span>
            <span className="tabular-nums text-emerald-700">
              {fmt(ps.netPay)} {ps.currency}
            </span>
          </div>

          {/* 公司負擔 */}
          {(employer.length > 0 || ps.employerCostTotal > 0) && (
            <Section title="公司負擔（不影響實發）" muted>
              {employer.map((l, i) => (
                <Row key={i} label={l.label} amount={l.amount} muted />
              ))}
              <Row label="公司負擔合計" amount={ps.employerCostTotal} bold muted />
            </Section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  children,
  muted,
}: {
  title: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border p-2.5", muted && "bg-muted/30")}>
      <div className="text-muted-foreground mb-1 text-xs font-semibold">
        {title}
      </div>
      <div className="divide-y">{children}</div>
    </div>
  );
}

function Row({
  label,
  amount,
  bold,
  muted,
}: {
  label: string;
  amount: number;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-1.5",
        bold && "font-medium",
      )}
    >
      <span className={cn(!bold && "text-muted-foreground")}>{label}</span>
      <span
        className={cn(
          "tabular-nums",
          amount < 0 ? "text-rose-600" : muted ? "text-muted-foreground" : "",
        )}
      >
        {amount < 0 ? "-" : ""}
        {fmt(Math.abs(amount))}
      </span>
    </div>
  );
}

type ItemAmount = { defId: string; amount: number };

function SalaryEditor({
  member,
  salaryItems,
  onClose,
}: {
  member: PayrollMember;
  salaryItems: SalaryItemDefRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const s = member.salary;
  const activeItems = salaryItems.filter((d) => d.active);

  const [payType, setPayType] = useState<"MONTHLY" | "HOURLY">(
    (s?.payType as "MONTHLY" | "HOURLY") ?? "MONTHLY",
  );
  const [baseAmount, setBaseAmount] = useState(String(s?.baseAmount ?? ""));
  const [standardWorkDays, setStandardWorkDays] = useState(
    String(s?.standardWorkDays ?? 22),
  );
  const [standardHoursPerDay, setStandardHoursPerDay] = useState(
    String(s?.standardHoursPerDay ?? 8),
  );
  const [overtimeMultiplier, setOvertimeMultiplier] = useState(
    String(s?.overtimeMultiplier ?? 1.34),
  );
  const [allowances, setAllowances] = useState<Line[]>(toLines(s?.allowances));
  const [deductions, setDeductions] = useState<Line[]>(toLines(s?.deductions));
  const [note, setNote] = useState(s?.note ?? "");
  // 勞健保 / 勞退
  const [insuredSalary, setInsuredSalary] = useState(
    s?.insuredSalary != null ? String(s.insuredSalary) : "",
  );
  const [dependents, setDependents] = useState(String(s?.dependents ?? 0));
  const [pensionSelfPct, setPensionSelfPct] = useState(
    String(Math.round((s?.pensionSelfRate ?? 0) * 1000) / 10),
  );
  const [laborInsured, setLaborInsured] = useState(s?.laborInsured ?? true);
  const [healthInsured, setHealthInsured] = useState(s?.healthInsured ?? true);
  const [pensionEnrolled, setPensionEnrolled] = useState(
    s?.pensionEnrolled ?? true,
  );
  // 薪資科目金額 + 就源扣繳率
  const [items, setItems] = useState<ItemAmount[]>(() =>
    parseMemberItems(s?.items),
  );
  const [taxPct, setTaxPct] = useState(
    String(Math.round((s?.taxWithholdRate ?? 0) * 1000) / 10),
  );

  function submit() {
    const base = Number(baseAmount);
    if (!Number.isFinite(base) || base < 0) {
      toast.error("請輸入正確的底薪金額");
      return;
    }
    start(async () => {
      try {
        await upsertSalaryProfile({
          memberId: member.membershipId,
          payType,
          baseAmount: base,
          currency: s?.currency ?? "TWD",
          standardWorkDays: Number(standardWorkDays) || 22,
          standardHoursPerDay: Number(standardHoursPerDay) || 8,
          overtimeMultiplier: Number(overtimeMultiplier) || 1.34,
          allowances: allowances.filter((l) => l.name.trim()),
          deductions: deductions.filter((l) => l.name.trim()),
          note: note.trim() || undefined,
          insuredSalary: insuredSalary.trim() ? Number(insuredSalary) : undefined,
          dependents: Number(dependents) || 0,
          laborInsured,
          healthInsured,
          pensionEnrolled,
          pensionSelfRate: (Number(pensionSelfPct) || 0) / 100,
          items: items.filter((i) => i.defId && i.amount > 0),
          taxWithholdRate: (Number(taxPct) || 0) / 100,
        });
        toast.success("已儲存薪資設定");
        router.refresh();
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "儲存失敗");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>薪資設定 · {displayName(member)}</DialogTitle>
          <DialogDescription>
            選擇薪資制別並填入底薪；加給 / 扣除為每月固定項目（如交通津貼、勞健保自付）。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPayType("MONTHLY")}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-medium",
                payType === "MONTHLY"
                  ? "border-primary bg-primary/5 text-primary"
                  : "text-muted-foreground",
              )}
            >
              月薪制
            </button>
            <button
              type="button"
              onClick={() => setPayType("HOURLY")}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-medium",
                payType === "HOURLY"
                  ? "border-primary bg-primary/5 text-primary"
                  : "text-muted-foreground",
              )}
            >
              時薪制
            </button>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="s-base">
              {payType === "HOURLY" ? "時薪金額" : "月薪金額"}
            </Label>
            <Input
              id="s-base"
              type="number"
              min={0}
              value={baseAmount}
              onChange={(e) => setBaseAmount(e.target.value)}
              placeholder={payType === "HOURLY" ? "如 200" : "如 40000"}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {payType === "MONTHLY" && (
              <div className="grid gap-1.5">
                <Label htmlFor="s-days">月標準工作天</Label>
                <Input
                  id="s-days"
                  type="number"
                  min={1}
                  max={31}
                  value={standardWorkDays}
                  onChange={(e) => setStandardWorkDays(e.target.value)}
                />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="s-hours">每日標準工時</Label>
              <Input
                id="s-hours"
                type="number"
                min={1}
                max={24}
                value={standardHoursPerDay}
                onChange={(e) => setStandardHoursPerDay(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="s-ot">加班倍率</Label>
              <Input
                id="s-ot"
                type="number"
                min={1}
                step={0.01}
                value={overtimeMultiplier}
                onChange={(e) => setOvertimeMultiplier(e.target.value)}
              />
            </div>
          </div>

          {/* 薪資科目（Phase 2）：從目錄挑科目 + 填金額，帶入應稅 / 計入投保 / 經常性旗標 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>薪資項目（科目）</Label>
              {activeItems.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setItems((it) => [
                      ...it,
                      { defId: activeItems[0].id, amount: 0 },
                    ])
                  }
                  className="text-primary inline-flex items-center gap-1 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" /> 新增一項
                </button>
              )}
            </div>
            {activeItems.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                尚未建立薪資科目。到上方「薪資科目」分頁一鍵建立常見科目後即可挑選。
              </p>
            ) : items.length === 0 ? (
              <p className="text-muted-foreground text-xs">（無）</p>
            ) : (
              <div className="space-y-1.5">
                {items.map((row, i) => {
                  const def = salaryItems.find((d) => d.id === row.defId);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <select
                        value={row.defId}
                        onChange={(e) =>
                          setItems((it) =>
                            it.map((x, idx) =>
                              idx === i ? { ...x, defId: e.target.value } : x,
                            ),
                          )
                        }
                        className="border-input bg-transparent dark:bg-input/30 h-9 flex-1 rounded-md border px-2 text-sm outline-none"
                      >
                        {activeItems.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.kind === "EARNING" ? "＋" : "－"} {d.name}
                          </option>
                        ))}
                        {def && !def.active && (
                          <option value={def.id}>{def.name}（停用）</option>
                        )}
                      </select>
                      <Input
                        type="number"
                        min={0}
                        value={row.amount || ""}
                        onChange={(e) =>
                          setItems((it) =>
                            it.map((x, idx) =>
                              idx === i
                                ? { ...x, amount: Number(e.target.value) || 0 }
                                : x,
                            ),
                          )
                        }
                        placeholder="金額"
                        className="w-28"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setItems((it) => it.filter((_, idx) => idx !== i))
                        }
                        className="hover:bg-muted rounded p-1.5 text-rose-600"
                        title="移除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <details className="rounded-lg border px-3 py-2">
            <summary className="text-muted-foreground cursor-pointer text-xs">
              其他加項 / 減項（未分類，無科目旗標）
            </summary>
            <div className="mt-2 space-y-3">
              <LineEditor
                title="固定加給（加項）"
                lines={allowances}
                onChange={setAllowances}
                placeholder="如 交通津貼"
              />
              <LineEditor
                title="固定扣除（減項）"
                lines={deductions}
                onChange={setDeductions}
                placeholder="如 其他扣款"
              />
            </div>
          </details>

          {/* 勞健保 / 勞退：投保薪資留空＝依本薪自動對應級距 */}
          <div className="space-y-2.5 rounded-lg border p-3">
            <div className="text-sm font-semibold">勞健保 / 勞退</div>
            <p className="text-muted-foreground text-xs">
              投保薪資留空＝依「本薪＋固定加給」自動對應級距。需先在「勞健保設定」帶入費率與級距，
              產生薪資單時才會自動計算勞保 / 健保 / 勞退。
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="s-insured">投保薪資（選填）</Label>
                <Input
                  id="s-insured"
                  type="number"
                  min={0}
                  value={insuredSalary}
                  onChange={(e) => setInsuredSalary(e.target.value)}
                  placeholder="自動"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="s-deps">健保眷口數</Label>
                <Input
                  id="s-deps"
                  type="number"
                  min={0}
                  max={3}
                  value={dependents}
                  onChange={(e) => setDependents(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="s-pself">勞退自提率（%）</Label>
                <Input
                  id="s-pself"
                  type="number"
                  min={0}
                  max={6}
                  step={0.5}
                  value={pensionSelfPct}
                  onChange={(e) => setPensionSelfPct(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="s-tax">薪資扣繳率（%）</Label>
                <Input
                  id="s-tax"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={taxPct}
                  onChange={(e) => setTaxPct(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="accent-primary h-4 w-4"
                  checked={laborInsured}
                  onChange={(e) => setLaborInsured(e.currentTarget.checked)}
                />
                加勞保
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="accent-primary h-4 w-4"
                  checked={healthInsured}
                  onChange={(e) => setHealthInsured(e.currentTarget.checked)}
                />
                加健保
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="accent-primary h-4 w-4"
                  checked={pensionEnrolled}
                  onChange={(e) => setPensionEnrolled(e.currentTarget.checked)}
                />
                提繳勞退
              </label>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="s-note">備註（選填）</Label>
            <Input
              id="s-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            取消
          </Button>
          <Button onClick={submit} disabled={pending}>
            儲存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LineEditor({
  title,
  lines,
  onChange,
  placeholder,
}: {
  title: string;
  lines: Line[];
  onChange: (l: Line[]) => void;
  placeholder: string;
}) {
  function update(i: number, patch: Partial<Line>) {
    onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function remove(i: number) {
    onChange(lines.filter((_, idx) => idx !== i));
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{title}</Label>
        <button
          type="button"
          onClick={() => onChange([...lines, { name: "", amount: 0 }])}
          className="text-primary inline-flex items-center gap-1 text-xs"
        >
          <Plus className="h-3.5 w-3.5" /> 新增一項
        </button>
      </div>
      {lines.length === 0 ? (
        <p className="text-muted-foreground text-xs">（無）</p>
      ) : (
        <div className="space-y-1.5">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={l.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder={placeholder}
                className="flex-1"
              />
              <Input
                type="number"
                min={0}
                value={l.amount || ""}
                onChange={(e) => update(i, { amount: Number(e.target.value) || 0 })}
                placeholder="金額"
                className="w-28"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="hover:bg-muted rounded p-1.5 text-rose-600"
                title="移除"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
