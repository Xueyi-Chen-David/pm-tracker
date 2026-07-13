"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Crown, Trash2, UserPlus, Mail } from "lucide-react";
import {
  addMember,
  inviteMemberByEmail,
  updateMember,
  removeMember,
  setOwner,
} from "@/server/actions/members";
import { displayName, displayInitial } from "@/lib/display";
import { MemberName } from "@/components/member-name";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type NamedUser = {
  id: string;
  name: string | null;
  nickname?: string | null;
  useNickname?: boolean | null;
  email: string | null;
};
type Member = {
  id: string;
  role: "OWNER" | "MEMBER" | "VIEWER";
  roleLabel: string | null;
  user: NamedUser & { image: string | null };
};
type UserOption = NamedUser;

// 角色只保留兩種：成員 / 負責人（負責人＝專案 owner）。
const ROLE_OPTIONS = [
  { value: "MEMBER", label: "成員" },
  { value: "OWNER", label: "負責人" },
] as const;

const selectClass =
  "border-input bg-transparent dark:bg-input/30 h-8 rounded-md border px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

export function MembersPanel({
  projectId,
  ownerId,
  members,
  allUsers,
  canEdit,
}: {
  projectId: string;
  ownerId: string | null;
  members: Member[];
  allUsers: UserOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState("MEMBER");
  const [email, setEmail] = useState("");

  const memberIds = new Set(members.map((m) => m.user.id));
  const available = allUsers.filter((u) => !memberIds.has(u.id));

  function run(fn: () => Promise<unknown>, okMsg?: string) {
    start(async () => {
      try {
        await fn();
        if (okMsg) toast.success(okMsg);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "操作失敗");
      }
    });
  }

  // 切換角色：選負責人＝設為專案 owner（setOwner 會一併把 role 設 OWNER）；選成員＝role MEMBER。
  function changeRole(m: Member, role: string) {
    if (role === "OWNER") {
      run(() => setOwner({ projectId, userId: m.user.id }), "已設為負責人");
    } else {
      run(
        () => updateMember({ memberId: m.id, projectId, role: "MEMBER" }),
        "已設為成員",
      );
    }
  }

  return (
    <div className="space-y-3">
      {/* 團隊成員：一長條橫向排列，不換行，過多則水平捲動。 */}
      {members.length === 0 ? (
        <p className="text-muted-foreground py-2 text-sm">尚未指派成員</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1.5">
          {members.map((m) => {
            const isOwner = m.user.id === ownerId;
            const roleValue = m.role === "OWNER" || isOwner ? "OWNER" : "MEMBER";
            return (
              <div
                key={m.id}
                className="bg-card flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-2"
              >
                <Avatar className="h-8 w-8 shrink-0">
                  {m.user.image && <AvatarImage src={m.user.image} alt="" />}
                  <AvatarFallback className="text-xs">
                    {displayInitial(m.user)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-1">
                  <span className="flex items-center gap-1 text-sm font-medium whitespace-nowrap">
                    <MemberName u={m.user} />
                    {isOwner && (
                      <Crown
                        className="h-3.5 w-3.5 shrink-0 text-amber-500"
                        aria-label="負責人"
                      />
                    )}
                  </span>
                  {canEdit ? (
                    <div className="flex items-center gap-1">
                      <select
                        value={roleValue}
                        disabled={pending}
                        onChange={(e) => changeRole(m, e.target.value)}
                        className={selectClass}
                      >
                        {ROLE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="移除"
                        disabled={pending}
                        onClick={() => {
                          if (
                            !confirm(
                              `確定將成員 ${displayName(m.user)} 移出此專案嗎？`,
                            )
                          )
                            return;
                          run(
                            () => removeMember({ memberId: m.id, projectId }),
                            "已移除成員",
                          );
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs whitespace-nowrap">
                      {isOwner ? "負責人" : "成員"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        <div className="space-y-2 border-t pt-3">
          {available.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                className={selectClass + " h-9 flex-1 text-sm"}
              >
                <option value="">選擇現有成員加入…</option>
                {available.map((u) => (
                  <option key={u.id} value={u.id}>
                    {displayName(u)}
                  </option>
                ))}
              </select>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className={selectClass + " h-9 text-sm"}
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                disabled={!newUserId || pending}
                onClick={() =>
                  run(async () => {
                    await addMember({
                      projectId,
                      userId: newUserId,
                      role: newRole as Member["role"],
                    });
                    setNewUserId("");
                  }, "已加入成員")
                }
              >
                <UserPlus className="h-4 w-4" /> 加入
              </Button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              type="email"
              placeholder="用 Email 邀請（尚無帳號者）"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-9 flex-1"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!email.includes("@") || pending}
              onClick={() =>
                run(async () => {
                  await inviteMemberByEmail({
                    projectId,
                    email,
                    role: newRole as Member["role"],
                  });
                  setEmail("");
                }, "已邀請")
              }
            >
              <Mail className="h-4 w-4" /> 邀請
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
