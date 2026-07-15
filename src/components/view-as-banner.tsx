"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye } from "lucide-react";
import { setViewAs } from "@/server/actions/view-as";

/** 視角預覽中的頂部提示條（含退出）。role 有值＝以某自訂角色視角，否則＝一般員工視角。 */
export function ViewAsBanner({ role }: { role?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function exit() {
    start(async () => {
      try {
        await setViewAs(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "退出失敗");
      }
    });
  }

  return (
    <div className="no-print flex items-center justify-center gap-3 bg-amber-500 px-4 py-1.5 text-center text-sm font-medium text-white">
      <span className="inline-flex items-center gap-1.5">
        <Eye className="h-4 w-4" />
        {role
          ? `「${role}」角色視角預覽中 —— 你正以此角色能看到的樣子瀏覽`
          : "員工視角預覽中 —— 你正以一般員工能看到的樣子瀏覽"}
      </span>
      <button
        type="button"
        onClick={exit}
        disabled={pending}
        className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold hover:bg-white/30"
      >
        退出
      </button>
    </div>
  );
}
