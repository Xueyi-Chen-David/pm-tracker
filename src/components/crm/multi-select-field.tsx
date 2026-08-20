"use client";

import { useState } from "react";
import { ChevronDown, Search, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type MultiSelectOption = { id: string; label: string };

/**
 * 多選 + 標記其中一位為「主要」的欄位（商機的聯絡人 / 負責人共用，見 deal-dialog.tsx）。
 * Popover + checkbox 清單沿用 attendance-track-manager.tsx 的既有寫法；「主要」是
 * 這裡新加的行為：已選項目下方顯示 chip，點星號切換主要，永遠恰好一位（或無人選時為
 * null）——移除掉目前主要那位時自動退回清單第一位，避免出現「有選人卻沒有主要」的空狀態。
 */
export function MultiSelectField({
  label,
  icon,
  options,
  selectedIds,
  primaryId,
  onChange,
  placeholder = "—",
  emptyHint = "沒有可選項目",
}: {
  label: string;
  /** 觸發鈕內文字左邊的小圖示（選填，如聯絡人 / 負責人各自的識別圖示）。 */
  icon?: React.ReactNode;
  options: MultiSelectOption[];
  selectedIds: string[];
  primaryId: string | null;
  onChange: (selectedIds: string[], primaryId: string | null) => void;
  placeholder?: string;
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  // 搜尋關鍵字：只在下拉清單裡篩選，不影響已選項目；關閉下拉時清空，避免下次打開時
  // 殘留上次的篩選條件把整份清單先擋掉。
  const [query, setQuery] = useState("");
  const byId = new Map(options.map((o) => [o.id, o]));
  const selected = selectedIds
    .map((id) => byId.get(id))
    .filter((o): o is MultiSelectOption => !!o);
  const filtered = query.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : options;

  function toggle(id: string) {
    const isOn = selectedIds.includes(id);
    const next = isOn ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
    const nextPrimary =
      primaryId && next.includes(primaryId) ? primaryId : (next[0] ?? null);
    onChange(next, nextPrimary);
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
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
              selected.length === 0 && "text-muted-foreground",
            )}
          >
            {selected.length === 0
              ? placeholder
              : selected.map((s) => s.label).join("、")}
          </span>
          <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          {options.length > 0 && (
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜尋…"
                autoFocus
                className="border-input bg-transparent focus:border-ring h-8 w-full rounded-md border pr-2 pl-7 text-sm outline-none"
              />
            </div>
          )}
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {options.length === 0 ? (
              <p className="text-muted-foreground px-1.5 py-1 text-xs">
                {emptyHint}
              </p>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground px-1.5 py-1 text-xs">
                找不到符合「{query.trim()}」的項目
              </p>
            ) : (
              filtered.map((o) => (
                <label
                  key={o.id}
                  className="hover:bg-muted flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(o.id)}
                    onChange={() => toggle(o.id)}
                    className="accent-primary h-4 w-4"
                  />
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                </label>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        // 已選項目上限高度 + 內部捲動：客戶底下聯絡人一多，chips 換行會一直往下長，
        // 把整列 grid 撐得很高，連帶把右邊「負責人」欄位往下擠、甚至遮住下一列的欄位。
        // 這裡跟活動清單（ACTIVITY_LIST_MAX_H）同一個做法：封頂，超過的用捲動看。
        <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
          {selected.map((s) => {
            const isPrimary = s.id === primaryId;
            return (
              <span
                key={s.id}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border py-0.5 pr-1.5 pl-2 text-xs",
                  isPrimary
                    ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200"
                    : "text-muted-foreground",
                )}
              >
                <button
                  type="button"
                  onClick={() => onChange(selectedIds, s.id)}
                  title={isPrimary ? "主要" : "設為主要"}
                  className={cn(
                    "shrink-0",
                    isPrimary
                      ? "text-amber-500"
                      : "text-muted-foreground/40 hover:text-amber-500",
                  )}
                >
                  <Star className={cn("h-3 w-3", isPrimary && "fill-current")} />
                </button>
                <span className="truncate">{s.label}</span>
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
                  title="移除"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
