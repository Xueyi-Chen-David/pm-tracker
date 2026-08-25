"use client";

import {
  cloneElement,
  isValidElement,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createCrmView,
  renameCrmView,
  deleteCrmView,
  createCrmViewColumn,
  updateCrmViewColumn,
  deleteCrmViewColumn,
  reorderCrmViewColumns,
} from "@/server/actions/crm";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { CrmViewLite, ViewColumn } from "@/components/crm/types";
import type { CrmViewColumnType } from "@prisma/client";

const COLUMN_TYPE_LABEL: Record<CrmViewColumnType, string> = {
  STAGE: "狀態（連動銷售階段）",
  CHECKBOX: "勾選框",
  DATE: "日期",
  TEXT: "文字",
  SELECT: "下拉選單",
  MAIL: "一輪寄信（已寄送＋日期＋已讀）",
};

/** 分頁的「新增清單」按鈕：只問名稱，建立後直接切過去那個分頁。 */
export function NewViewButton({ trigger }: { trigger: React.ReactElement }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function openDialog() {
    setName("");
    setError(null);
    setOpen(true);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return setError("請輸入名稱");
    start(async () => {
      try {
        const res = await createCrmView(name.trim());
        if (!res.ok) return setError("新增失敗");
        setOpen(false);
        toast.success("已新增分頁");
        router.push(`/crm?tab=view:${res.id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "新增失敗");
      }
    });
  }

  return (
    <>
      {isValidElement(trigger)
        ? cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, {
            onClick: openDialog,
          })
        : trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>新增自訂分頁</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="view-name">名稱</Label>
              <Input
                id="view-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例：業務開發清單"
                autoFocus
              />
            </div>
            {error && (
              <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                取消
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "新增中…" : "新增"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * 管理一個自訂分頁：改名／刪除分頁、以及底下所有欄位的新增／編輯／刪除／排序。
 * 型別在欄位建立後鎖死（見 server action 註解）——要換型別就刪掉重建一欄。
 */
export function ViewColumnsDialog({
  view,
  trigger,
}: {
  view: CrmViewLite;
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(view.name);
  const [pending, start] = useTransition();
  const [columnForm, setColumnForm] = useState<
    { mode: "create" } | { mode: "edit"; column: ViewColumn } | null
  >(null);

  function openDialog() {
    setName(view.name);
    setOpen(true);
  }

  function saveName() {
    if (!name.trim() || name.trim() === view.name) return;
    start(async () => {
      const res = await renameCrmView(view.id, name.trim());
      if (!res.ok) toast.error(res.error);
      router.refresh();
    });
  }

  function removeView() {
    if (!confirm(`刪除分頁「${view.name}」？欄位與已填的值會一併刪除（商機本身不受影響）。`))
      return;
    start(async () => {
      await deleteCrmView(view.id);
      setOpen(false);
      toast.success("已刪除分頁");
      router.push("/crm?tab=pipeline");
      router.refresh();
    });
  }

  function removeColumn(id: string, label: string) {
    if (!confirm(`刪除欄位「${label}」？已填的值會一併刪除。`)) return;
    start(async () => {
      await deleteCrmViewColumn(id);
      router.refresh();
    });
  }

  function move(index: number, dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= view.columns.length) return;
    const ids = view.columns.map((c) => c.id);
    [ids[index], ids[to]] = [ids[to], ids[index]];
    start(async () => {
      await reorderCrmViewColumns(view.id, ids);
      router.refresh();
    });
  }

  return (
    <>
      {isValidElement(trigger)
        ? cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, {
            onClick: openDialog,
          })
        : trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>管理分頁</DialogTitle>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="vc-name">分頁名稱</Label>
            <div className="flex gap-1.5">
              <Input
                id="vc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={saveName}
              />
              <button
                type="button"
                onClick={removeView}
                disabled={pending}
                title="刪除分頁"
                className="text-destructive hover:bg-destructive/10 shrink-0 rounded-md p-2"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>欄位</Label>
            <div
              className={cn(
                "divide-y rounded-lg border",
                pending && "pointer-events-none opacity-60",
              )}
            >
              {view.columns.map((c, i) => (
                <div key={c.id} className="flex items-center gap-1.5 px-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{c.label}</div>
                    <div className="text-muted-foreground text-[11px]">
                      {COLUMN_TYPE_LABEL[c.type]}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="text-muted-foreground hover:bg-muted rounded p-1 disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === view.columns.length - 1}
                    className="text-muted-foreground hover:bg-muted rounded p-1 disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setColumnForm({ mode: "edit", column: c })}
                    className="text-muted-foreground hover:bg-muted rounded p-1"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeColumn(c.id, c.label)}
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded p-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {view.columns.length === 0 && (
                <div className="text-muted-foreground p-3 text-center text-sm">
                  還沒有欄位
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setColumnForm({ mode: "create" })}
              className="text-muted-foreground hover:bg-muted hover:text-foreground flex w-full items-center justify-center gap-1 rounded-lg border border-dashed py-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" /> 新增欄位
            </button>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              關閉
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {columnForm && (
        <ColumnFormDialog
          viewId={view.id}
          initial={columnForm.mode === "edit" ? columnForm.column : null}
          onClose={() => setColumnForm(null)}
        />
      )}
    </>
  );
}

/** 新增／編輯一個欄位（受控開關，沒有自己的 trigger——由 ViewColumnsDialog 決定何時開）。
 *  型別只有新增時能選；編輯模式型別鎖死顯示為唯讀文字。 */
function ColumnFormDialog({
  viewId,
  initial,
  onClose,
}: {
  viewId: string;
  initial: ViewColumn | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const editing = !!initial;
  const [label, setLabel] = useState(initial?.label ?? "");
  const [type, setType] = useState<CrmViewColumnType>(initial?.type ?? "CHECKBOX");
  const [optionsText, setOptionsText] = useState(
    (initial?.selectOptions ?? []).join(", "),
  );
  const [header, setHeader] = useState(initial?.header ?? "");
  const [template, setTemplate] = useState(initial?.template ?? "");
  const [footer, setFooter] = useState(initial?.footer ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!label.trim()) return setError("請輸入欄位名稱");
    const selectOptions = optionsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (type === "SELECT" && selectOptions.length === 0) {
      return setError("下拉選單至少要有一個選項");
    }
    const mailFields = {
      header: header.trim() || undefined,
      template: template.trim() || undefined,
      footer: footer.trim() || undefined,
    };
    start(async () => {
      try {
        const res = editing
          ? await updateCrmViewColumn(initial.id, {
              label: label.trim(),
              selectOptions,
              ...mailFields,
            })
          : await createCrmViewColumn(viewId, {
              label: label.trim(),
              type,
              selectOptions,
              ...mailFields,
            });
        if (!res.ok) return setError(res.error ?? "儲存失敗");
        toast.success(editing ? "已更新欄位" : "已新增欄位");
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "儲存失敗");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={type === "MAIL" ? "sm:max-w-4xl" : "sm:max-w-sm"}>
        <DialogHeader>
          <DialogTitle>{editing ? "編輯欄位" : "新增欄位"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cf-label">欄位名稱</Label>
            <Input
              id="cf-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例：事前確認"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-type">型別</Label>
            {editing ? (
              <p className="text-muted-foreground text-sm">
                {COLUMN_TYPE_LABEL[type]}（建立後不能改，要換型別請刪掉重建）
              </p>
            ) : (
              <select
                id="cf-type"
                value={type}
                onChange={(e) => setType(e.target.value as CrmViewColumnType)}
                className="border-input h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm"
              >
                {(Object.keys(COLUMN_TYPE_LABEL) as CrmViewColumnType[]).map((t) => (
                  <option key={t} value={t}>
                    {COLUMN_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            )}
          </div>
          {type === "SELECT" && (
            <div className="space-y-1.5">
              <Label htmlFor="cf-options">選項（用逗號分隔）</Label>
              <Input
                id="cf-options"
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder="例：A, B, C"
              />
            </div>
          )}
          {type === "MAIL" && (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">
                這一輪信件的頭／中／尾，只屬於這一欄——跟其他輪次不共用，每輪可以完全
                不一樣。三段都可以用 <code className="bg-muted rounded px-1">{"{{企業名}}"}</code>{" "}
                插入該列商機對應的公司名稱。
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cf-header">開頭</Label>
                  <Textarea
                    id="cf-header"
                    rows={6}
                    value={header}
                    onChange={(e) => setHeader(e.target.value)}
                    placeholder={"{{企業名}}\nご担当者様\n\n開頭固定文字…"}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cf-footer">結尾</Label>
                  <Textarea
                    id="cf-footer"
                    rows={6}
                    value={footer}
                    onChange={(e) => setFooter(e.target.value)}
                    placeholder="結尾固定文字、簽名檔…"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-template">
                  中間（預設範本，各企業可各自修改）
                </Label>
                <Textarea
                  id="cf-template"
                  rows={6}
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  placeholder="這一輪的預設內容——每家企業第一次編輯時會先帶入這段，之後可各自修改"
                />
              </div>
            </div>
          )}
          {error && (
            <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "儲存中…" : editing ? "儲存" : "新增"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
