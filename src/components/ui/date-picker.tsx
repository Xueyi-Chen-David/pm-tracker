"use client";

import { useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
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
 */
function toDate(value?: string) {
  if (!value) return undefined;
  const d = parseISO(value);
  return isValid(d) ? d : undefined;
}

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "選擇日期",
  disabled = false,
  min,
  max,
  className,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** yyyy-MM-dd，早於此日的日期不可選（對齊原生 input 的 min） */
  min?: string;
  /** yyyy-MM-dd，晚於此日的日期不可選（對齊原生 input 的 max） */
  max?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = toDate(value);
  const minDate = toDate(min);
  const maxDate = toDate(max);
  // 超出 min/max 的日子直接變灰不可點，不用等按下去才報錯。
  const outOfRange = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        aria-label={ariaLabel}
        className={cn(
          "border-input bg-transparent dark:bg-input/30 focus-visible:border-ring flex h-9 w-full items-center gap-1.5 rounded-md border px-2 text-sm outline-none disabled:opacity-50",
          className,
        )}
      >
        <CalendarIcon className="text-muted-foreground h-4 w-4 shrink-0" />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-left",
            !selected && "text-muted-foreground",
          )}
        >
          {selected ? format(selected, "yyyy/MM/dd") : placeholder}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          disabled={outOfRange.length > 0 ? outOfRange : undefined}
          onSelect={(d) => {
            onChange(d ? format(d, "yyyy-MM-dd") : "");
            setOpen(false);
          }}
        />
        {/* 清除鍵：原生 date input 有清除、換成日曆後不補一顆就少一種操作。 */}
        {selected ? (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="text-muted-foreground hover:text-foreground mt-1 inline-flex w-full items-center justify-center gap-0.5 text-xs"
          >
            <X className="h-3 w-3" /> 清除
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
