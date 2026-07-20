"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Crown, Users } from "lucide-react";
import { setTrackAttendance } from "@/server/actions/attendance";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { MemberName } from "@/components/member-name";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Member = {
  id: string;
  name: string | null;
  nickname: string | null;
  useNickname: boolean;
  email: string | null;
  isBoss: boolean;
  trackAttendance: boolean;
};

/** 挑選哪些成員要納入出席追蹤（勾選＝顯示在出席月曆）。 */
export function AttendanceTrackManager({ members }: { members: Member[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [local, setLocal] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(members.map((m) => [m.id, m.trackAttendance])),
  );

  function toggle(id: string, on: boolean) {
    setLocal((p) => ({ ...p, [id]: on }));
    start(async () => {
      try {
        await setTrackAttendance(id, on);
        router.refresh();
      } catch (e) {
        setLocal((p) => ({ ...p, [id]: !on }));
        toast.error(e instanceof Error ? e.message : "更新失敗");
      }
    });
  }

  const count = Object.values(local).filter(Boolean).length;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
        title="追蹤成員"
      >
        <Users className="h-4 w-4" />
        <span className="hidden sm:inline">追蹤成員</span>
        <span className="tabular-nums">（{count}）</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="text-sm font-medium">選擇要追蹤出席的成員</div>
        <p className="text-muted-foreground text-xs">
          只有勾選的成員會出現在出席月曆。
        </p>
        <div className="scroll-y mt-1 max-h-72 space-y-0.5 overflow-y-auto">
          {members.map((m) => (
            <label
              key={m.id}
              className="hover:bg-muted flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm"
            >
              <input
                type="checkbox"
                checked={local[m.id] ?? false}
                disabled={pending}
                onChange={(e) => toggle(m.id, e.currentTarget.checked)}
                className="accent-primary h-4 w-4"
              />
              <MemberName u={m} className="min-w-0" />
              {m.isBoss && (
                <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              )}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
