"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListPlus, Plus, X } from "lucide-react";
import { saveDailyReport } from "@/server/actions/daily";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const NOTE_MAX = 50;

type Row = {
  key: string;
  title: string;
  actual: string; // 完成數量，以字串保存，允許清空後再輸入
};

export type DailyReportInitial = {
  note: string;
  items: { title: string; actual: number }[];
};

export type TodoLite = { id: string; title: string };

let seq = 0;
function newRow(init?: Partial<Row>): Row {
  seq += 1;
  return { key: `r${seq}`, title: "", actual: "", ...init };
}

function toNum(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function DailyReportForm({
  initial,
  todos = [],
}: {
  initial: DailyReportInitial | null;
  /** 未完成的待辦，供「從待辦加入」直接帶入為工作項目。 */
  todos?: TodoLite[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const saved = initial !== null;

  const [rows, setRows] = useState<Row[]>(() =>
    initial && initial.items.length > 0
      ? initial.items.map((it) =>
          newRow({
            title: it.title,
            actual: it.actual ? String(it.actual) : "",
          }),
        )
      : [newRow()],
  );
  const [note, setNote] = useState(initial?.note ?? "");

  const hasNamed = rows.some((r) => r.title.trim().length > 0);

  function patch(key: string, field: keyof Row, value: string) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }
  function addRow() {
    setRows((rs) => (rs.length >= 30 ? rs : [...rs, newRow()]));
  }
  function removeRow(key: string) {
    setRows((rs) => (rs.length <= 1 ? [newRow()] : rs.filter((r) => r.key !== key)));
  }
  // 從待辦帶入一列：已有同名列就略過；有空白列就填進去，否則新增（上限 30）。
  function addTodoTitle(title: string) {
    const t = title.trim();
    if (!t) return;
    setRows((rs) => {
      if (rs.some((r) => r.title.trim() === t)) return rs;
      const emptyIdx = rs.findIndex((r) => r.title.trim() === "");
      if (emptyIdx >= 0) {
        return rs.map((r, i) => (i === emptyIdx ? { ...r, title: t } : r));
      }
      return rs.length >= 30 ? rs : [...rs, newRow({ title: t })];
    });
  }
  // 目前列已用到的標題（判斷待辦是否已加入）。
  const usedTitles = new Set(
    rows.map((r) => r.title.trim()).filter((s) => s.length > 0),
  );

  function submit() {
    const payload = {
      items: rows
        .filter((r) => r.title.trim().length > 0)
        .map((r) => ({ title: r.title.trim(), actual: toNum(r.actual) })),
      note: note.trim() || undefined,
    };
    start(async () => {
      try {
        await saveDailyReport(payload);
        toast.success(saved ? "已更新今日報告" : "已送出今日報告");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "儲存失敗");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* 任務列表 */}
      <div className="space-y-2">
        <div className="text-muted-foreground hidden items-center gap-2 px-1 text-[11px] font-medium sm:flex">
          <div className="flex-1">任務 / 工作項目</div>
          <div className="w-24 text-center">完成數量</div>
          <div className="w-7" />
        </div>

        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            <input
              value={r.title}
              maxLength={100}
              onChange={(e) => patch(r.key, "title", e.currentTarget.value)}
              placeholder="例：拜訪客戶 / 出貨單處理"
              className="border-input bg-background focus-visible:ring-ring h-9 min-w-0 flex-1 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
            />
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={r.actual}
              onChange={(e) => patch(r.key, "actual", e.currentTarget.value)}
              placeholder="數量"
              className="border-input bg-background focus-visible:ring-ring h-9 w-24 shrink-0 rounded-md border px-2 text-center text-sm tabular-nums focus-visible:ring-2 focus-visible:outline-none"
            />
            <button
              type="button"
              onClick={() => removeRow(r.key)}
              aria-label="刪除任務"
              className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            disabled={rows.length >= 30}
            className="flex-1"
          >
            <Plus className="h-4 w-4" /> 新增任務
          </Button>
          {/* 從待辦清單直接帶入工作項目，免得複製貼上。 */}
          <Popover>
            <PopoverTrigger
              className="border-input hover:bg-muted inline-flex h-8 shrink-0 items-center gap-1 rounded-md border px-3 text-sm font-medium"
              title="從待辦清單加入工作項目"
            >
              <ListPlus className="h-4 w-4" /> 從待辦加入
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0">
              <div className="border-b px-3 py-2">
                <div className="text-sm font-medium">從待辦加入工作項目</div>
                <p className="text-muted-foreground text-[11px]">
                  點一下把未完成的待辦帶入今日報告（完成數量再自行填）。
                </p>
              </div>
              {todos.length === 0 ? (
                <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                  目前沒有未完成的待辦。
                </p>
              ) : (
                <div className="scroll-y max-h-72 divide-y overflow-y-auto">
                  {todos.map((td) => {
                    const added = usedTitles.has(td.title.trim());
                    return (
                      <button
                        key={td.id}
                        type="button"
                        disabled={added || rows.length >= 30}
                        onClick={() => addTodoTitle(td.title)}
                        className="hover:bg-muted/50 flex w-full items-center gap-2 px-3 py-2 text-left text-sm disabled:opacity-50"
                      >
                        {added ? (
                          <span className="text-muted-foreground shrink-0 text-[11px]">
                            已加入
                          </span>
                        ) : (
                          <Plus className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="min-w-0 flex-1 break-words">
                          {td.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* 說明文字（≤50 字） */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="dr-note" className="text-sm font-medium">
            說明（選填）
          </label>
          <span
            className={cn(
              "text-xs tabular-nums",
              note.length >= NOTE_MAX ? "text-rose-600" : "text-muted-foreground",
            )}
          >
            {note.length}/{NOTE_MAX}
          </span>
        </div>
        <input
          id="dr-note"
          value={note}
          maxLength={NOTE_MAX}
          onChange={(e) => setNote(e.currentTarget.value.slice(0, NOTE_MAX))}
          placeholder="一句話說明今天的重點（最多 50 字）"
          className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-xs">
          {saved ? "今天已送出，可隨時更新。" : "每天記得填寫今日報告。"}
        </span>
        <Button onClick={submit} disabled={pending || !hasNamed}>
          {pending ? "儲存中…" : saved ? "更新今日報告" : "送出今日報告"}
        </Button>
      </div>
    </div>
  );
}
