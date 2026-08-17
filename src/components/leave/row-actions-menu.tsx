"use client";

import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export type RowAction = {
  label: string;
  icon?: React.ReactNode;
  destructive?: boolean;
  onSelect: () => void;
};

/** 表格「操作」欄的 ⋮ 選單；沒有可用動作時不畫出觸發鈕（避免空按鈕）。 */
export function RowActionsMenu({ actions }: { actions: RowAction[] }) {
  if (actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="操作"
        className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-7 w-7 items-center justify-center rounded"
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {actions.map((a) => (
          <DropdownMenuItem
            key={a.label}
            onClick={a.onSelect}
            className={cn(
              "gap-2",
              a.destructive && "text-destructive focus:text-destructive",
            )}
          >
            {a.icon}
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
