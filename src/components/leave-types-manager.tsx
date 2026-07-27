"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Sparkles } from "lucide-react";
import {
  createLeaveType,
  updateLeaveType,
  deleteLeaveType,
  createDefaultLeaveTypes,
} from "@/server/actions/leave";
import type { OrgLeaveType } from "@/server/queries";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type Editing = { mode: "create" } | { mode: "edit"; lt: OrgLeaveType } | null;

/** 給付比例文字（100=全薪、0=無薪、其它=部分薪）。 */
function paidLabel(p: number): string {
  if (p >= 100) return "全薪";
  if (p <= 0) return "無薪";
  return `${p}% 薪`;
}

/** 給付比例對應的badge色調：全薪綠、部分薪橘、無薪灰。 */
function paidTone(p: number): string {
  if (p >= 100) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (p <= 0) return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

/**
 * 假別管理：新增 / 編輯 / 刪除假別，設定給付比例（決定薪資扣薪）。需 leave.manage 權限。
 * 唯讀模式（canManage=false）只顯示清單。
 */
export function LeaveTypesManager({
  leaveTypes,
  canManage,
}: {
  leaveTypes: OrgLeaveType[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [pending, start] = useTransition();

  function seedDefaults() {
    start(async () => {
      try {
        await createDefaultLeaveTypes();
        toast.success("已建立常見假別");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "建立失敗");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          假別的「給付比例」決定薪資如何計算：例如 特休 100%（全薪）、病假 50%（半薪）、事假 0%（無薪）。
          在出席月曆登記請假時挑選假別，薪資即依此扣薪。
        </p>
        {canManage && (
          <div className="flex shrink-0 gap-2">
            {leaveTypes.length === 0 && (
              <Button variant="outline" onClick={seedDefaults} disabled={pending} className="gap-1.5">
                <Sparkles className="h-4 w-4" /> 建立常見假別
              </Button>
            )}
            <Button onClick={() => setEditing({ mode: "create" })} className="gap-1.5">
              <Plus className="h-4 w-4" /> 新增假別
            </Button>
          </div>
        )}
      </div>

      {leaveTypes.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
          尚未建立任何假別。
          {canManage && "點「建立常見假別」一鍵帶入特休 / 事假 / 病假…，或自行新增。"}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>假別</TableHead>
                <TableHead>給付比例</TableHead>
                <TableHead>年度天數</TableHead>
                <TableHead>狀態</TableHead>
                {canManage && <TableHead className="text-right">操作</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaveTypes.map((lt) => (
                <TableRow key={lt.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: lt.color ?? "#94a3b8" }}
                      />
                      <span className="font-medium">{lt.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn(paidTone(lt.paidPercent))}>
                      {paidLabel(lt.paidPercent)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lt.annualQuotaDays != null ? `${lt.annualQuotaDays} 天` : "—"}
                  </TableCell>
                  <TableCell>
                    {lt.active ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-emerald-700"
                      >
                        啟用
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-muted-foreground">
                        停用
                      </Badge>
                    )}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => setEditing({ mode: "edit", lt })}
                          className="hover:bg-muted rounded p-1"
                          title="編輯"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <DeleteLeaveButton id={lt.id} name={lt.name} />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editing && (
        <LeaveDialog
          key={editing.mode === "edit" ? editing.lt.id : "create"}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function DeleteLeaveButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`確定刪除假別「${name}」？已登記此假別的出勤紀錄會保留但解除假別關聯。`))
          return;
        start(async () => {
          try {
            await deleteLeaveType(id);
            toast.success("已刪除假別");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "刪除失敗");
          }
        });
      }}
      className="hover:bg-muted rounded p-1 text-rose-600 disabled:opacity-50"
      title="刪除"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function LeaveDialog({
  editing,
  onClose,
}: {
  editing: Exclude<Editing, null>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const lt = editing.mode === "edit" ? editing.lt : null;

  const [name, setName] = useState(lt?.name ?? "");
  const [paidPercent, setPaidPercent] = useState(String(lt?.paidPercent ?? 100));
  const [quota, setQuota] = useState(
    lt?.annualQuotaDays != null ? String(lt.annualQuotaDays) : "",
  );
  const [color, setColor] = useState(lt?.color ?? "#0ea5e9");
  const [active, setActive] = useState(lt?.active ?? true);

  function submit() {
    if (!name.trim()) {
      toast.error("請輸入假別名稱");
      return;
    }
    const payload = {
      name: name.trim(),
      paidPercent: Number(paidPercent) || 0,
      annualQuotaDays: quota.trim() ? Number(quota) : undefined,
      color,
      active,
    };
    start(async () => {
      try {
        const res = lt
          ? await updateLeaveType({ id: lt.id, ...payload })
          : await createLeaveType(payload);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(lt ? "已更新假別" : "已新增假別");
        router.refresh();
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "儲存失敗");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{lt ? "編輯假別" : "新增假別"}</DialogTitle>
          <DialogDescription>給付比例決定該假別如何影響薪資。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="lt-name">假別名稱</Label>
            <Input
              id="lt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：特休、事假、病假"
              maxLength={30}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="lt-paid">給付比例（%）</Label>
              <Input
                id="lt-paid"
                type="number"
                min={0}
                max={100}
                value={paidPercent}
                onChange={(e) => setPaidPercent(e.target.value)}
              />
              <span className="text-muted-foreground text-[11px]">
                100=全薪、0=無薪、50=半薪
              </span>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lt-quota">年度天數（選填）</Label>
              <Input
                id="lt-quota"
                type="number"
                min={0}
                value={quota}
                onChange={(e) => setQuota(e.target.value)}
                placeholder="如 7"
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="lt-color">顏色</Label>
            <input
              id="lt-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-7 w-10 cursor-pointer rounded border"
            />
          </div>
          {lt && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.currentTarget.checked)}
                className="accent-primary h-4 w-4"
              />
              啟用（可在出勤登記中選用）
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            取消
          </Button>
          <Button onClick={submit} disabled={pending}>
            {lt ? "儲存" : "新增"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
