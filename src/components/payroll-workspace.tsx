"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calculator, Pencil, RefreshCw, Trash2, Check, X, Plus } from "lucide-react";
import {
  computePayslip,
  computeAllPayslips,
  upsertSalaryProfile,
  setPayslipStatus,
  deletePayslip,
} from "@/server/actions/payroll";
import type { PayrollMember, OrgLeaveType } from "@/server/queries";
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

type Tab = "payslips" | "salary" | "leave";

export function PayrollWorkspace({
  members,
  leaveTypes,
  canManage,
  canManageLeave,
  year,
  month,
}: {
  members: PayrollMember[];
  leaveTypes: OrgLeaveType[];
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

  const withSalary = members.filter((m) => m.salary);

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

  return (
    <div className="space-y-4">
      {/* 分頁 */}
      <div className="flex items-center gap-1 border-b">
        <TabButton active={tab === "payslips"} onClick={() => setTab("payslips")}>
          薪資單
        </TabButton>
        {canManage && (
          <TabButton active={tab === "salary"} onClick={() => setTab("salary")}>
            薪資設定
          </TabButton>
        )}
        <TabButton active={tab === "leave"} onClick={() => setTab("leave")}>
          假別
        </TabButton>
      </div>

      {tab === "payslips" && (
        <div className="space-y-3">
          {canManage && withSalary.length > 0 && (
            <div className="flex justify-end">
              <Button onClick={computeAll} disabled={pending} className="gap-1.5">
                <Calculator className="h-4 w-4" /> 產生 / 重算全部（{year}/{month}）
              </Button>
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">成員</th>
                  <th className="px-3 py-2 text-left font-medium">制別</th>
                  <th className="px-3 py-2 text-right font-medium">應發</th>
                  <th className="px-3 py-2 text-right font-medium">實發</th>
                  <th className="px-3 py-2 text-center font-medium">狀態</th>
                  <th className="px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <PayslipRow
                    key={m.membershipId}
                    m={m}
                    year={year}
                    month={month}
                    canManage={canManage}
                    onView={() => setViewing(m)}
                    onSetup={() => setEditing(m)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground text-xs">
            薪資單依當月出席紀錄（出勤 / 請假各假別 / 缺勤）與打卡工時，套用各成員薪資設定即時計算。
            調整出勤或薪資設定後，按「重算」更新。
          </p>
        </div>
      )}

      {tab === "salary" && canManage && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">成員</th>
                <th className="px-3 py-2 text-left font-medium">制別</th>
                <th className="px-3 py-2 text-right font-medium">底薪</th>
                <th className="px-3 py-2 text-right font-medium">加給 / 扣除</th>
                <th className="px-3 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
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
      )}

      {tab === "leave" && (
        <LeaveTypesManager leaveTypes={leaveTypes} canManage={canManageLeave} />
      )}

      {editing && (
        <SalaryEditor
          key={editing.membershipId}
          member={editing}
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
  onView,
  onSetup,
}: {
  m: PayrollMember;
  year: number;
  month: number;
  canManage: boolean;
  onView: () => void;
  onSetup: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const ps = m.payslip;

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
    <tr className="hover:bg-muted/30 border-t">
      <td className="px-3 py-2">{displayName(m)}</td>
      <td className="px-3 py-2">
        {m.salary ? PAY_TYPE_LABEL[m.salary.payType] ?? m.salary.payType : "—"}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {ps ? fmt(ps.grossPay) : "—"}
      </td>
      <td className="px-3 py-2 text-right font-medium tabular-nums">
        {ps ? fmt(ps.netPay) : "—"}
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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>薪資單 · {displayName(member)}</DialogTitle>
          <DialogDescription>
            {ps.payType === "HOURLY" ? "時薪制" : "月薪制"} ·{" "}
            出勤 {ps.workedDays} 天 · 請假 {ps.leaveDays} 天 · 缺勤 {ps.absentDays} 天
            {ps.overtimeHours > 0 && ` · 加班 ${ps.overtimeHours} 小時`}
          </DialogDescription>
        </DialogHeader>
        <div className="divide-y text-sm">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground">{l.label}</span>
              <span
                className={cn(
                  "tabular-nums",
                  l.amount < 0 ? "text-rose-600" : "text-foreground",
                )}
              >
                {l.amount < 0 ? "-" : "+"}
                {fmt(Math.abs(l.amount))}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between py-2 font-medium">
            <span>應發</span>
            <span className="tabular-nums">{fmt(ps.grossPay)}</span>
          </div>
          {ps.deductionTotal > 0 && (
            <div className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground">固定扣除合計</span>
              <span className="tabular-nums text-rose-600">
                -{fmt(ps.deductionTotal)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between py-2 text-base font-bold">
            <span>實發</span>
            <span className="tabular-nums">
              {fmt(ps.netPay)} {ps.currency}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SalaryEditor({
  member,
  onClose,
}: {
  member: PayrollMember;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const s = member.salary;

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
            placeholder="如 勞保自付"
          />

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
