"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Sparkles, Check as CheckIcon } from "lucide-react";
import {
  createSalaryItemDef,
  updateSalaryItemDef,
  deleteSalaryItemDef,
  seedDefaultSalaryItems,
} from "@/server/actions/payroll-settings";
import type { SalaryItemDefRow } from "@/server/queries";
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

type Editing = { mode: "create" } | { mode: "edit"; it: SalaryItemDefRow } | null;

/** 薪資科目目錄：新增 / 編輯 / 刪除，設定應稅 / 計入投保 / 經常性等旗標。需 payroll.manage。 */
export function SalaryItemsManager({
  items,
  canManage,
}: {
  items: SalaryItemDefRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [pending, start] = useTransition();

  function seed() {
    start(async () => {
      try {
        await seedDefaultSalaryItems();
        toast.success("已建立常見薪資科目");
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
          薪資科目的旗標決定計算方式：<strong>計入投保</strong>＝屬工資、影響投保級距；
          <strong>應稅</strong>＝計入薪資所得（免稅科目可設免稅上限，如伙食 3,000）；
          <strong>非經常性</strong>＝獎金，供二代健保高額獎金判定。設好後在各成員「薪資設定」挑科目填金額。
        </p>
        {canManage && (
          <div className="flex shrink-0 gap-2">
            {items.length === 0 && (
              <Button variant="outline" onClick={seed} disabled={pending} className="gap-1.5">
                <Sparkles className="h-4 w-4" /> 建立常見科目
              </Button>
            )}
            <Button onClick={() => setEditing({ mode: "create" })} className="gap-1.5">
              <Plus className="h-4 w-4" /> 新增科目
            </Button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
          尚未建立任何薪資科目。
          {canManage && "點「建立常見科目」一鍵帶入伙食津貼 / 全勤獎金 / 年終獎金…，或自行新增。"}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>科目</TableHead>
                <TableHead>計入投保</TableHead>
                <TableHead>課稅</TableHead>
                <TableHead>性質</TableHead>
                <TableHead>狀態</TableHead>
                {canManage && <TableHead className="text-right">操作</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0",
                          it.kind === "EARNING"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-rose-200 bg-rose-50 text-rose-700",
                        )}
                      >
                        {it.kind === "EARNING" ? "加項" : "減項"}
                      </Badge>
                      <span className="font-medium">{it.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {it.countsToInsurance ? (
                      <CheckIcon className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={
                          it.taxable
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-sky-200 bg-sky-50 text-sky-700"
                        }
                      >
                        {it.taxable ? "應稅" : "免稅"}
                      </Badge>
                      {it.taxFreeLimit != null && (
                        <span className="text-muted-foreground text-xs">
                          上限 {it.taxFreeLimit}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        it.recurring
                          ? "border-slate-200 bg-slate-50 text-slate-600"
                          : "border-violet-200 bg-violet-50 text-violet-700"
                      }
                    >
                      {it.recurring ? "經常性" : "獎金"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {it.active ? (
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
                          onClick={() => setEditing({ mode: "edit", it })}
                          className="hover:bg-muted rounded p-1"
                          title="編輯"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <DeleteButton id={it.id} name={it.name} />
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
        <ItemDialog
          key={editing.mode === "edit" ? editing.it.id : "create"}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function DeleteButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`確定刪除科目「${name}」？已設定此科目的成員金額會失效。`)) return;
        start(async () => {
          try {
            await deleteSalaryItemDef(id);
            toast.success("已刪除");
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

function ItemDialog({
  editing,
  onClose,
}: {
  editing: Exclude<Editing, null>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const it = editing.mode === "edit" ? editing.it : null;

  const [name, setName] = useState(it?.name ?? "");
  const [kind, setKind] = useState<"EARNING" | "DEDUCTION">(
    (it?.kind as "EARNING" | "DEDUCTION") ?? "EARNING",
  );
  const [taxable, setTaxable] = useState(it?.taxable ?? true);
  const [insured, setInsured] = useState(it?.countsToInsurance ?? true);
  const [recurring, setRecurring] = useState(it?.recurring ?? true);
  const [taxFreeLimit, setTaxFreeLimit] = useState(
    it?.taxFreeLimit != null ? String(it.taxFreeLimit) : "",
  );
  const [active, setActive] = useState(it?.active ?? true);

  function submit() {
    if (!name.trim()) {
      toast.error("請輸入科目名稱");
      return;
    }
    const payload = {
      name: name.trim(),
      kind,
      taxable,
      countsToInsurance: insured,
      recurring,
      taxFreeLimit: taxFreeLimit.trim() ? Number(taxFreeLimit) : undefined,
      active,
    };
    start(async () => {
      try {
        if (it) await updateSalaryItemDef({ id: it.id, ...payload });
        else await createSalaryItemDef(payload);
        toast.success(it ? "已更新科目" : "已新增科目");
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
          <DialogTitle>{it ? "編輯薪資科目" : "新增薪資科目"}</DialogTitle>
          <DialogDescription>旗標決定此科目如何影響投保、稅與二代健保。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="si-name">科目名稱</Label>
            <Input
              id="si-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：伙食津貼、全勤獎金"
              maxLength={30}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setKind("EARNING")}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-medium",
                kind === "EARNING" ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground",
              )}
            >
              加項
            </button>
            <button
              type="button"
              onClick={() => setKind("DEDUCTION")}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-medium",
                kind === "DEDUCTION" ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground",
              )}
            >
              減項
            </button>
          </div>
          <div className="space-y-2">
            <Check label="應稅（計入薪資所得）" checked={taxable} onChange={setTaxable} />
            {kind === "EARNING" && (
              <>
                <Check label="計入投保薪資（屬工資）" checked={insured} onChange={setInsured} />
                <Check
                  label="經常性給與（取消＝獎金，二代健保計費）"
                  checked={recurring}
                  onChange={setRecurring}
                />
                {!taxable && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="si-limit">免稅上限（選填，如伙食 3000）</Label>
                    <Input
                      id="si-limit"
                      type="number"
                      min={0}
                      value={taxFreeLimit}
                      onChange={(e) => setTaxFreeLimit(e.target.value)}
                      placeholder="超過部分計為應稅"
                    />
                  </div>
                )}
              </>
            )}
            {it && <Check label="啟用" checked={active} onChange={setActive} />}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            取消
          </Button>
          <Button onClick={submit} disabled={pending}>
            {it ? "儲存" : "新增"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="accent-primary h-4 w-4"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      {label}
    </label>
  );
}
