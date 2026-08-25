"use client";

import { useState } from "react";
import { ChevronDown, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * 「企業名稱」專用的單選 + 可搜尋 + 可新增欄位——跟 MultiSelectField（聯絡人 /
 * 負責人共用那顆）同一套 Popover + 搜尋清單視覺語言，差別是這裡單選、沒有「主要」
 * 概念，而且允許輸入清單裡沒有的全新名稱（新企業）。
 */
export function CompanyComboboxField({
  label,
  icon,
  options,
  value,
  onChange,
  placeholder = "選擇或輸入企業名稱",
  required,
}: {
  label: string;
  icon?: React.ReactNode;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim();
  const filtered = trimmedQuery
    ? options.filter((o) => o.toLowerCase().includes(trimmedQuery.toLowerCase()))
    : options;
  const exactMatch = options.some((o) => o === trimmedQuery);

  function select(name: string) {
    onChange(name);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="space-y-1.5">
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQuery("");
        }}
      >
        <PopoverTrigger className="border-input bg-transparent dark:bg-input/30 focus-visible:border-ring flex h-9 w-full items-center gap-1.5 rounded-md border px-2 text-sm outline-none">
          {icon}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-left",
              !value && "text-muted-foreground",
            )}
          >
            {value || placeholder}
          </span>
          <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋或輸入新企業名稱…"
              autoFocus
              className="border-input bg-transparent focus:border-ring h-8 w-full rounded-md border pr-2 pl-7 text-sm outline-none"
            />
          </div>
          <div className="mt-1 max-h-56 space-y-0.5 overflow-y-auto">
            {trimmedQuery && !exactMatch && (
              <button
                type="button"
                onClick={() => select(trimmedQuery)}
                className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">新增「{trimmedQuery}」</span>
              </button>
            )}
            {filtered.length === 0 ? (
              !trimmedQuery && (
                <p className="text-muted-foreground px-1.5 py-1 text-xs">
                  還沒有任何企業，直接在上面打字新增
                </p>
              )
            ) : (
              filtered.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => select(name)}
                  className={cn(
                    "hover:bg-muted flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm",
                    name === value && "bg-muted",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
