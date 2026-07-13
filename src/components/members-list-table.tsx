import Link from "next/link";
import { Crown } from "lucide-react";
import type { WorkspaceMember } from "@/server/queries";
import { displayName, displayInitial } from "@/lib/display";
import { MemberName } from "@/components/member-name";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MemberDeleteButton } from "@/components/member-delete-button";

export function MembersListTable({
  members,
  canManage = true,
}: {
  members: WorkspaceMember[];
  canManage?: boolean;
}) {
  return (
    <div className="bg-card overflow-x-auto rounded-xl border">
      <div className="min-w-[760px]">
        {/* 表頭 */}
        <div className="text-muted-foreground bg-muted/50 flex items-center gap-3 border-b px-3 py-2 text-xs font-medium">
          <div className="w-60 shrink-0">姓名</div>
          <div className="w-32 shrink-0">職稱</div>
          <div className="w-36 shrink-0">出席</div>
          <div className="w-14 shrink-0 text-center">負責</div>
          <div className="w-14 shrink-0 text-center">參與</div>
          <div className="w-14 shrink-0 text-center">週報</div>
          <div className="flex-1" />
          <div className="w-9 shrink-0" />
        </div>

        {/* 列 */}
        <div className="divide-y">
          {members.map((m) => {
            const initials = displayInitial(m);
            return (
              <div
                key={m.id}
                className="hover:bg-muted/40 flex items-center gap-3 px-3 py-2"
              >
                <Link
                  href={`/team/${m.id}`}
                  className="flex w-60 shrink-0 items-center gap-2.5"
                >
                  <Avatar className="h-8 w-8 shrink-0" title={displayName(m)}>
                    {m.image && <AvatarImage src={m.image} alt="" />}
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <MemberName u={m} className="min-w-0 text-sm font-medium" />
                      {m.isBoss && (
                        <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      )}
                      {(m.role === "OWNER" || m.role === "ADMIN") && (
                        <span className="shrink-0 rounded bg-violet-100 px-1.5 text-[10px] text-violet-700">
                          {m.role === "OWNER" ? "擁有者" : "管理者"}
                        </span>
                      )}
                      {!m.active && (
                        <span className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">
                          停用
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground truncate text-[11px]">
                      {m.email}
                    </div>
                  </div>
                </Link>
                <div className="text-muted-foreground w-32 shrink-0 truncate text-sm">
                  {m.jobTitle || "—"}
                </div>
                <div className="text-muted-foreground w-36 shrink-0 truncate text-sm">
                  {m.attendance || "—"}
                </div>
                <div className="w-14 shrink-0 text-center text-sm tabular-nums">
                  {m._count.ownedProjects}
                </div>
                <div className="w-14 shrink-0 text-center text-sm tabular-nums">
                  {m._count.memberships}
                </div>
                <div className="w-14 shrink-0 text-center text-sm tabular-nums">
                  {m._count.weeklyUpdates}
                </div>
                <div className="flex-1" />
                <div className="w-9 shrink-0">
                  {canManage && (
                    <MemberDeleteButton
                      id={m.id}
                      name={displayName(m)}
                      mode="icon"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
