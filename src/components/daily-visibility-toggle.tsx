"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setDailyReportChainVisible } from "@/server/actions/org-settings";

/** 管理者設定：上級的上級是否也看得到下屬的每日報告。 */
export function DailyVisibilityToggle({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();

  function toggle(next: boolean) {
    setOn(next);
    start(async () => {
      try {
        await setDailyReportChainVisible(next);
        router.refresh();
      } catch (e) {
        setOn(!next);
        toast.error(e instanceof Error ? e.message : "更新失敗");
      }
    });
  }

  return (
    <label className="bg-muted/40 flex items-center gap-2 rounded-md px-3 py-2 text-sm">
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(e) => toggle(e.currentTarget.checked)}
        className="accent-primary h-4 w-4"
      />
      讓「上級的上級」也看得到下屬日報（關閉時只有直屬主管看得到）
    </label>
  );
}
