"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { setViewAsEmployee } from "@/server/actions/view-as";
import { cn } from "@/lib/utils";

/** 側欄的「以員工視角預覽」切換（僅管理者 / 老闆看得到）。 */
export function ViewAsToggle({ previewing }: { previewing: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      try {
        await setViewAsEmployee(!previewing);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "切換失敗");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        previewing
          ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      title="用一般員工的角度預覽側欄與頁面存取"
    >
      {previewing ? (
        <EyeOff className="h-4.5 w-4.5 shrink-0" />
      ) : (
        <Eye className="h-4.5 w-4.5 shrink-0" />
      )}
      {previewing ? "退出員工視角" : "以員工視角預覽"}
    </button>
  );
}
