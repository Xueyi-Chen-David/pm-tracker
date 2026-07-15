"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { saveDailyReport } from "@/server/actions/daily";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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
}: {
  initial: DailyReportInitial | null;
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

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          disabled={rows.length >= 30}
          className="w-full"
        >
          <Plus className="h-4 w-4" /> 新增任務
        </Button>
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
