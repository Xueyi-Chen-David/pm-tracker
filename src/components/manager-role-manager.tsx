"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { setMemberManagerRole } from "@/server/actions/team";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { MemberName } from "@/components/member-name";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { NameSource } from "@/lib/display";

type Member = NameSource & {
  id: string; // user id
  role: "OWNER" | "ADMIN" | "MEMBER";
};

/** 指派 / 取消組織管理者（ADMIN）。擁有者一律是管理者，且至少保留一位。 */
export function ManagerRoleManager({ members }: { members: Member[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [local, setLocal] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      members.map((m) => [m.id, m.role === "OWNER" || m.role === "ADMIN"]),
    ),
  );

  function toggle(m: Member, on: boolean) {
    if (m.role === "OWNER") return;
    setLocal((p) => ({ ...p, [m.id]: on }));
    start(async () => {
      try {
        await setMemberManagerRole(m.id, on);
        router.refresh();
      } catch (e) {
        setLocal((p) => ({ ...p, [m.id]: !on }));
        toast.error(e instanceof Error ? e.message : "更新失敗");
      }
    });
  }

  const count = Object.values(local).filter(Boolean).length;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
      >
        <ShieldCheck className="h-4 w-4" /> 管理者（{count}）
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="text-sm font-medium">設定管理者</div>
        <p className="text-muted-foreground text-xs">
          管理者可管理成員、組織架構與各項設定；組織至少保留一位。
        </p>
        <div className="scroll-y mt-1 max-h-72 space-y-0.5 overflow-y-auto">
          {members.map((m) => (
            <label
              key={m.id}
              className={cn(
                "hover:bg-muted flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm",
                m.role === "OWNER" && "opacity-70",
              )}
            >
              <input
                type="checkbox"
                checked={local[m.id] ?? false}
                disabled={pending || m.role === "OWNER"}
                onChange={(e) => toggle(m, e.currentTarget.checked)}
                className="accent-primary h-4 w-4"
              />
              <MemberName u={m} className="min-w-0" />
              {m.role === "OWNER" && (
                <span className="text-muted-foreground ml-auto shrink-0 text-[11px]">
                  擁有者
                </span>
              )}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
