"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, Check, UserRound, ShieldCheck } from "lucide-react";
import { setViewAs } from "@/server/actions/view-as";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export type PreviewRole = { id: string; name: string; color: string | null };

/**
 * 側欄的「視角預覽」選單（僅管理者 / 老闆看得到）。
 * 可切換成「一般員工」或任一自訂角色（人資 / 會計…）的視角，確認該角色實際能看到 / 操作什麼。
 * previewValue：目前預覽對象（null=真實身分、"employee"、"role:<id>"）。
 */
export function ViewAsMenu({
  roles,
  previewValue,
}: {
  roles: PreviewRole[];
  previewValue: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const previewing = previewValue !== null;

  function choose(value: string | null) {
    start(async () => {
      try {
        await setViewAs(value);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "切換失敗");
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60",
          previewing
            ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
        title="用一般員工或某角色的角度預覽側欄與頁面存取"
      >
        <Eye className="h-4.5 w-4.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">
          {previewing ? "預覽中 · 切換視角" : "以其他視角預覽"}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>以此視角預覽</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => choose(null)}>
            <ShieldCheck className="text-muted-foreground h-4 w-4" />
            <span className="min-w-0 flex-1 truncate">我的真實身分</span>
            {previewValue === null && <Check className="text-primary h-4 w-4" />}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => choose("employee")}>
            <UserRound className="text-muted-foreground h-4 w-4" />
            <span className="min-w-0 flex-1 truncate">一般員工</span>
            {previewValue === "employee" && (
              <Check className="text-primary h-4 w-4" />
            )}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {roles.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>自訂角色</DropdownMenuLabel>
              {roles.map((r) => {
                const value = `role:${r.id}`;
                return (
                  <DropdownMenuItem key={r.id} onClick={() => choose(value)}>
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: r.color ?? "#64748b" }}
                    />
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    {previewValue === value && (
                      <Check className="text-primary h-4 w-4" />
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
