"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Plus, Trash2 } from "lucide-react";
import { importYearlyHolidays } from "@/server/actions/attendance";
import { fixedHolidaysForYear } from "@/lib/tw-holidays";
import { inputCls } from "@/components/leave/form-field";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

type Row = { date: string; name: string; checked: boolean };

function buildRows(year: number): Row[] {
  return fixedHolidaysForYear(year).map((h) => ({ ...h, checked: true }));
}

/**
 * 年度假日匯入：把國曆固定日期的國定假日自動列出（元旦 / 和平紀念日 / 兒童節 /
 * 勞動節 / 國慶日），可勾選調整，也能手動加日期（農曆春節、端午、中秋等逐年
 * 變動、無法自動推算，需自行輸入）。套用後一次登記為所有追蹤中在職成員當天的休假，
 * 免去逐一點格子、逐人登記的重複勞動；之後仍可在月曆個別調整。
 */
export function AttendanceHolidayImport({ thisYear }: { thisYear: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [year, setYear] = useState(thisYear);
  const [rows, setRows] = useState<Row[]>(() => buildRows(thisYear));

  function resetForYear(y: number) {
    setYear(y);
    setRows(buildRows(y));
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { date: `${year}-01-01`, name: "", checked: true },
    ]);
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  const checkedCount = rows.filter((r) => r.checked && r.date).length;

  function submit() {
    const dates = rows
      .filter((r) => r.checked && r.date)
      .map((r) => ({ date: r.date, name: r.name.trim() || undefined }));
    if (dates.length === 0) {
      toast.error("請至少勾選一個日期。");
      return;
    }
    start(async () => {
      try {
        const res = await importYearlyHolidays({ year, dates });
        if (!res.ok) {
          toast.error(res.error ?? "匯入失敗");
          return;
        }
        toast.success(
          `已將 ${res.dateCount} 個日期登記為 ${res.memberCount} 位成員的休假`,
        );
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "匯入失敗");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) resetForYear(thisYear);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" title="匯入年度假日">
            <CalendarPlus className="h-4 w-4" />
            <span className="hidden sm:inline">匯入年度假日</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <CalendarPlus className="h-4.5 w-4.5" /> 匯入年度假日
          </DialogTitle>
        </DialogHeader>

        <p className="text-muted-foreground text-xs">
          已自動列出 {year} 年國曆固定日期的國定假日。農曆假期（春節、端午、中秋）與
          清明節逐年不同、無法自動推算，請比照政府行政機關辦公日曆表自行新增。
          套用後會覆蓋勾選日期當天原本的登記，之後仍可在月曆個別調整。
        </p>

        <div className="flex items-center gap-2">
          <Label htmlFor="hi-year">年度</Label>
          <input
            id="hi-year"
            type="number"
            className={cn(inputCls, "h-8 w-24")}
            value={year}
            onChange={(e) => resetForYear(Number(e.currentTarget.value) || thisYear)}
          />
        </div>

        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                className="accent-primary h-4 w-4 shrink-0"
                checked={r.checked}
                onChange={(e) => updateRow(i, { checked: e.currentTarget.checked })}
              />
              <input
                type="date"
                className={cn(inputCls, "h-8 flex-1 px-1.5 text-xs")}
                value={r.date}
                onChange={(e) => updateRow(i, { date: e.currentTarget.value })}
              />
              <input
                type="text"
                placeholder="假日名稱（選填）"
                className={cn(inputCls, "h-8 w-28 px-1.5 text-xs")}
                value={r.name}
                onChange={(e) => updateRow(i, { name: e.currentTarget.value })}
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="text-muted-foreground shrink-0 hover:text-rose-600"
                title="移除這個日期"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-muted-foreground py-4 text-center text-xs">
              尚未列出任何日期，點下方「新增日期」加入。
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> 新增日期（如農曆春節、端午、中秋）
        </button>

        <DialogFooter>
          <Button
            size="sm"
            disabled={pending || checkedCount === 0}
            onClick={submit}
          >
            套用（{checkedCount} 個日期）
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
