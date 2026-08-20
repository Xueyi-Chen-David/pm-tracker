"use client";

import { useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
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
 * 清除行為也不可靠（商機「預計成交日」欄位踩過），改成自己畫的元件行為完全確定、
 * 樣式也跟同一頁的 MultiSelectField 觸發鈕一致。
 */
export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "選擇日期",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const parsed = value ? parseISO(value) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        className="border-input bg-transparent dark:bg-input/30 focus-visible:border-ring flex h-9 w-full items-center gap-1.5 rounded-md border px-2 text-sm outline-none"
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
          onSelect={(d) => {
            onChange(d ? format(d, "yyyy-MM-dd") : "");
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
