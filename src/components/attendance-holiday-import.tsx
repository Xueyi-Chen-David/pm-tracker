"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { getOrgHolidays, importYearlyHolidays } from "@/server/actions/attendance";
import { expandHolidayRanges, fixedHolidaysForYear } from "@/lib/tw-holidays";
import { inputCls } from "@/components/leave/form-field";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

type Row = { date: string; endDate: string; name: string; checked: boolean };

function fixedRows(year: number): Row[] {
  return fixedHolidaysForYear(year).map((h) => ({ ...h, endDate: "", checked: true }));
}

/**
 * 年度假日：組織某年度的假日清單（單日或區間），存在 OrgHoliday，開啟時直接帶回上次存的內容；
 * 該年度還沒存過時，自動列出國曆固定日期的國定假日（元旦 / 和平紀念日 / 兒童節 / 勞動節 /
 * 國慶日）。農曆春節、端午、中秋等逐年變動、無法自動推算，需自行新增（可選區間）。
 * 套用後會儲存清單，並把展開後的平日登記為所有追蹤中在職成員當天的放假；之後仍可在月曆個別調整。
 */
export function AttendanceHolidayImport({ thisYear }: { thisYear: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(thisYear);
  const [rows, setRows] = useState<Row[]>([]);
  const [saved, setSaved] = useState(false);

  async function loadYear(y: number) {
    setYear(y);
    setLoading(true);
    try {
      const list = await getOrgHolidays(y);
      setSaved(list.length > 0);
      setRows(
        list.length > 0
          ? list.map((h) => ({
              date: h.date,
              endDate: h.endDate === h.date ? "" : h.endDate,
              name: h.name,
              checked: true,
            }))
          : fixedRows(y),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "讀取假日清單失敗");
      setSaved(false);
      setRows(fixedRows(y));
    } finally {
      setLoading(false);
    }
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { date: `${year}-01-01`, endDate: "", name: "", checked: true },
    ]);
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  const picked = rows.filter((r) => r.checked && r.date);
  const dayCount = expandHolidayRanges(
    picked.map((r) => ({ date: r.date, endDate: r.endDate || null })),
  ).size;

  function submit() {
    const entries = picked.map((r) => ({
      date: r.date,
      endDate: r.endDate && r.endDate !== r.date ? r.endDate : undefined,
      name: r.name.trim() || undefined,
    }));
    start(async () => {
      try {
        const res = await importYearlyHolidays({ year, entries });
        if (!res.ok) {
          toast.error(res.error ?? "儲存失敗");
          return;
        }
        toast.success(
          res.memberCount > 0
            ? `已儲存 ${year} 年假日，${res.memberCount} 位成員的 ${res.dateCount} 個平日已登記為放假`
            : `已儲存 ${year} 年假日`,
        );
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "儲存失敗");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void loadYear(thisYear);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" title="年度假日">
            <CalendarPlus className="h-4 w-4" />
            <span className="hidden sm:inline">年度假日</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <CalendarPlus className="h-4.5 w-4.5" /> 年度假日
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={loading || pending}
              onClick={() => loadYear(year - 1)}
              title="上一年"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="w-16 text-center text-sm font-medium tabular-nums">
              {year} 年
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={loading || pending}
              onClick={() => loadYear(year + 1)}
              title="下一年"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[11px]",
              saved ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground",
            )}
          >
            {loading ? "讀取中…" : saved ? "已儲存的清單" : "尚未設定，已帶入固定國定假日"}
          </span>
        </div>

        <p className="text-muted-foreground text-xs">
          農曆假期（春節、端午、中秋）與清明節逐年不同，請比照政府行政機關辦公日曆表自行新增；
          連假可以設結束日變成區間。套用後會儲存這份清單，並把平日登記為追蹤成員的「放假」，
          覆蓋當天原本的登記；從清單移除的日期，當天的放假也會一併取消。
        </p>

        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                className="accent-primary h-4 w-4 shrink-0"
                checked={r.checked}
                onChange={(e) => updateRow(i, { checked: e.currentTarget.checked })}
              />
              <DatePicker
                size="sm"
                clearable={false}
                showWeekday
                className="w-[9.5rem] shrink-0"
                ariaLabel="開始日"
                value={r.date}
                onChange={(v) =>
                  updateRow(i, {
                    date: v,
                    endDate: r.endDate && r.endDate < v ? "" : r.endDate,
                  })
                }
              />
              <span className="text-muted-foreground shrink-0 text-xs">~</span>
              <DatePicker
                size="sm"
                showWeekday
                className="w-[9.5rem] shrink-0"
                ariaLabel="結束日（選填）"
                placeholder="單日"
                min={r.date}
                value={r.endDate}
                onChange={(v) => updateRow(i, { endDate: v })}
              />
              <input
                type="text"
                placeholder="名稱（選填）"
                className={cn(inputCls, "h-8 min-w-0 flex-1 px-1.5 text-xs")}
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
          <Plus className="h-3.5 w-3.5" /> 新增日期或區間（如農曆春節、端午、中秋）
        </button>

        <DialogFooter>
          <Button
            size="sm"
            disabled={pending || loading}
            onClick={submit}
          >
            儲存並套用（共 {dayCount} 天）
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
