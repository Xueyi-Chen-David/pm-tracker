"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Loader2, Plus, Trash2 } from "lucide-react";
import { addOkrQuarter, addOkrYear, deleteOkrPeriod } from "@/server/actions/okr";
import { QUARTER_MONTHS } from "@/lib/okr";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** 新增年份：預設帶入「已有年份的下一年」。 */
export function AddOkrYearButton({ suggested }: { suggested: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(String(suggested));
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const res = await addOkrYear(Number(year));
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`已新增 ${year} 年`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setYear(String(suggested));
      }}
    >
      <PopoverTrigger className={cn(buttonVariants(), "gap-1.5")}>
        <CalendarPlus className="h-4 w-4" /> 新增年份
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 gap-2">
        <div className="text-sm font-medium">新增年份</div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="border-input focus-visible:border-ring h-9 w-24 rounded-md border bg-transparent px-2 text-sm tabular-nums outline-none"
          />
          <span className="text-sm">年</span>
          <Button size="sm" className="ml-auto" disabled={pending || !year} onClick={submit}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}新增
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** 在年份底下新增季度：只列還沒建立的 Q1–Q4。 */
export function AddOkrQuarterButton({ year, existing }: { year: number; existing: number[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const remaining = [1, 2, 3, 4].filter((q) => !existing.includes(q));
  if (remaining.length === 0) return null;

  function add(q: number) {
    start(async () => {
      const res = await addOkrQuarter(year, q);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`已新增 ${year} Q${q}`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-7 gap-1 text-xs")}>
        <Plus className="h-3.5 w-3.5" /> 新增季度
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 gap-1 p-1.5">
        {remaining.map((q) => (
          <button
            key={q}
            type="button"
            disabled={pending}
            onClick={() => add(q)}
            className="hover:bg-muted flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm"
          >
            <span className="font-medium">Q{q}</span>
            <span className="text-muted-foreground text-xs">{QUARTER_MONTHS[q]}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** 刪除空的年份 / 季度（quarter=0＝年份）。 */
export function DeleteOkrPeriodButton({
  year,
  quarter,
  label,
  withText = false,
}: {
  year: number;
  quarter: number;
  label: string;
  /** 顯示「刪除這個年份」文字（預設只有垃圾桶圖示）。 */
  withText?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size={withText ? "sm" : "icon-sm"}
      title={`刪除${label}`}
      disabled={pending}
      className="text-muted-foreground hover:text-destructive"
      onClick={() => {
        if (!confirm(`確定刪除「${label}」？`)) return;
        start(async () => {
          const res = await deleteOkrPeriod(year, quarter);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success(`已刪除${label}`);
          router.refresh();
        });
      }}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      {withText && `刪除 ${label}`}
    </Button>
  );
}
