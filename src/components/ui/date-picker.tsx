"use client";

import { useState } from "react";
import { addYears, format, isValid, parseISO } from "date-fns";
import { zhTW as dfZhTW } from "date-fns/locale";
import { zhTW } from "react-day-picker/locale";
import { CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * 日曆式日期選擇器：對外介面是 yyyy-MM-dd 字串（跟原生 <input type="date"> 相容），
 * 內部改用 Popover + Calendar 畫——原生 date input 在不同瀏覽器/OS 下長相不一致、
 * 清除行為也不可靠（商機「預計成交日」欄位踩過），而且原生日曆一律往下開，
 * 視窗矮的時候會被切掉根本選不到（待辦清單踩過）。Popover 會自動翻到上方避讓。
 *
 * 可受控（value + onChange）或不受控（defaultValue，可再掛 onChange 監聽）；
 * 給 name 會多渲染一個 hidden input，讓 <form> / FormData 照常取值。
 */
function toDate(value?: string | null) {
  if (!value) return undefined;
  const d = parseISO(value);
  return isValid(d) ? d : undefined;
}

const triggerBase =
  "border-input bg-transparent dark:bg-input/30 hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-ring/50 flex w-full items-center rounded-md border text-left outline-none transition-colors focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 data-popup-open:border-ring";

const sizes = {
  default: { trigger: "h-9 gap-2 px-2.5 text-sm", icon: "h-4 w-4" },
  sm: { trigger: "h-8 gap-1.5 px-2 text-xs", icon: "h-3.5 w-3.5" },
  xs: { trigger: "h-7 gap-1 px-1.5 text-xs", icon: "h-3.5 w-3.5" },
} as const;

export function DatePicker({
  id,
  name,
  value,
  defaultValue,
  onChange,
  placeholder = "選擇日期",
  disabled = false,
  clearable = true,
  size = "default",
  showWeekday,
  min,
  max,
  className,
  ariaLabel,
  title,
}: {
  id?: string;
  /** 給了就渲染 hidden input，放在 <form> 裡可直接送出 */
  name?: string;
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** 可清成空值（必填欄位傳 false） */
  clearable?: boolean;
  size?: keyof typeof sizes;
  /** 顯示星期幾；預設只有 default 尺寸顯示 */
  showWeekday?: boolean;
  /** yyyy-MM-dd，早於此日的日期不可選（對齊原生 input 的 min） */
  min?: string | null;
  /** yyyy-MM-dd，晚於此日的日期不可選（對齊原生 input 的 max） */
  max?: string | null;
  className?: string;
  ariaLabel?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value !== undefined ? (value ?? "") : inner;
  const selected = toDate(current);
  const minDate = toDate(min);
  const maxDate = toDate(max);
  // 超出 min/max 的日子直接變灰不可點，不用等按下去才報錯。
  const outOfRange = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];
  const today = new Date();
  const todayOk =
    (!minDate || format(today, "yyyy-MM-dd") >= format(minDate, "yyyy-MM-dd")) &&
    (!maxDate || format(today, "yyyy-MM-dd") <= format(maxDate, "yyyy-MM-dd"));
  const withWeekday = showWeekday ?? size === "default";
  const s = sizes[size];
  const canClear = clearable && !!selected && !disabled;

  function commit(v: string) {
    if (value === undefined) setInner(v);
    onChange?.(v);
  }

  return (
    <div className={cn("relative min-w-0", className)}>
      {name ? <input type="hidden" name={name} value={current} /> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={id}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          title={title}
          className={cn(triggerBase, s.trigger, canClear && "pr-7")}
        >
          <CalendarIcon className={cn("text-muted-foreground shrink-0", s.icon)} />
          <span
            className={cn(
              "min-w-0 flex-1 truncate tabular-nums",
              !selected && "text-muted-foreground",
            )}
          >
            {selected ? format(selected, "yyyy/MM/dd") : placeholder}
            {selected && withWeekday ? (
              <span className="text-muted-foreground ml-1">
                週{format(selected, "EEEEE", { locale: dfZhTW })}
              </span>
            ) : null}
          </span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto gap-0 p-0">
          <Calendar
            mode="single"
            locale={zhTW}
            captionLayout="dropdown"
            startMonth={new Date(1950, 0)}
            endMonth={addYears(today, 10)}
            selected={selected}
            defaultMonth={selected ?? (todayOk ? today : (minDate ?? maxDate))}
            disabled={outOfRange.length > 0 ? outOfRange : undefined}
            className="p-3 [--cell-size:--spacing(8)]"
            onSelect={(d) => {
              if (!d) return; // 再點一次已選的日子不清空，清除走下方按鈕
              commit(format(d, "yyyy-MM-dd"));
              setOpen(false);
            }}
          />
          <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
            {clearable ? (
              <button
                type="button"
                disabled={!selected}
                onClick={() => {
                  commit("");
                  setOpen(false);
                }}
                className="text-muted-foreground hover:text-destructive text-xs disabled:pointer-events-none disabled:opacity-40"
              >
                清除
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              disabled={!todayOk}
              onClick={() => {
                commit(format(today, "yyyy-MM-dd"));
                setOpen(false);
              }}
              className="text-primary text-xs font-medium hover:underline disabled:pointer-events-none disabled:opacity-40"
            >
              今天
            </button>
          </div>
        </PopoverContent>
      </Popover>
      {canClear ? (
        <button
          type="button"
          aria-label="清除日期"
          title="清除"
          onClick={() => commit("")}
          className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-1/2 right-1 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * 月份選擇器：對外介面是 yyyy-MM 字串（跟原生 <input type="month"> 相容）。
 */
export function MonthPicker({
  value,
  onChange,
  className,
  ariaLabel = "選擇月份",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [y, m] = value.split("-").map(Number);
  const [viewYear, setViewYear] = useState(y || new Date().getFullYear());
  const now = new Date();

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setViewYear(y || now.getFullYear());
      }}
    >
      <PopoverTrigger
        type="button"
        aria-label={ariaLabel}
        className={cn(triggerBase, "h-8 w-auto gap-1.5 px-2.5 text-sm tabular-nums", className)}
      >
        <CalendarIcon className="text-muted-foreground h-4 w-4 shrink-0" />
        {y && m ? `${y} 年 ${m} 月` : "選擇月份"}
      </PopoverTrigger>
      <PopoverContent align="center" className="w-64 gap-2 p-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label="上一年"
            onClick={() => setViewYear((v) => v - 1)}
            className="hover:bg-muted flex h-7 w-7 items-center justify-center rounded-md"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium tabular-nums">{viewYear} 年</span>
          <button
            type="button"
            aria-label="下一年"
            onClick={() => setViewYear((v) => v + 1)}
            className="hover:bg-muted flex h-7 w-7 items-center justify-center rounded-md"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((mm) => {
            const isSel = viewYear === y && mm === m;
            const isNow = viewYear === now.getFullYear() && mm === now.getMonth() + 1;
            return (
              <button
                key={mm}
                type="button"
                onClick={() => {
                  onChange(`${viewYear}-${String(mm).padStart(2, "0")}`);
                  setOpen(false);
                }}
                className={cn(
                  "h-9 rounded-md text-sm transition-colors",
                  isSel
                    ? "bg-primary text-primary-foreground"
                    : isNow
                      ? "bg-muted font-medium"
                      : "hover:bg-muted",
                )}
              >
                {mm} 月
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
