"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { updateWorkDescription } from "@/server/actions/team";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * 成員「工作描述」就地檢視 / 編輯。canEdit 為 false 時純顯示（每個人都看得到），
 * 為 true（本人或管理者）時點一下用 Popover 編輯並儲存。
 */
export function WorkDescriptionEditor({
  userId,
  value,
  canEdit,
  className,
}: {
  userId: string;
  value: string | null;
  canEdit: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [pending, start] = useTransition();

  if (!canEdit) {
    return (
      <span
        className={cn(
          "text-muted-foreground block min-w-0 truncate text-sm",
          className,
        )}
        title={value ?? undefined}
      >
        {value?.trim() || "—"}
      </span>
    );
  }

  function save() {
    start(async () => {
      try {
        await updateWorkDescription({ userId, workDescription: draft });
        toast.success("已更新工作描述");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "更新失敗");
      }
    });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(value ?? ""); // 每次開啟同步最新值
      }}
    >
      <PopoverTrigger
        className={cn(
          "hover:bg-muted/60 group flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-left text-sm",
          className,
        )}
        title="編輯工作描述"
      >
        <span
          className={cn(
            "min-w-0 truncate",
            value?.trim() ? "" : "text-muted-foreground/60",
          )}
        >
          {value?.trim() || "新增工作描述…"}
        </span>
        <Pencil className="text-muted-foreground/50 group-hover:text-muted-foreground h-3 w-3 shrink-0" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2">
        <div className="text-sm font-medium">工作描述</div>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          placeholder="這位成員負責的工作內容…"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            取消
          </Button>
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? "儲存中…" : "儲存"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
