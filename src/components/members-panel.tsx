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
import { MEMBER_ROLE_OPTIONS } from "@/lib/constants";
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

  return (
    <div className="space-y-3">
      <ul className="scroll-y max-h-[20rem] divide-y overflow-y-auto pr-1.5">
        {members.map((m) => {
          const isOwner = m.user.id === ownerId;
          const initials = displayInitial(m.user);
          return (
            <li key={m.id} className="py-2.5">
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  {m.user.image && <AvatarImage src={m.user.image} alt="" />}
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <MemberName u={m.user} />
                    {isOwner && (
                      <Crown
                        className="h-3.5 w-3.5 shrink-0 text-amber-500"
                        aria-label="負責人"
                      />
                    )}
                  </div>
                  <div className="text-muted-foreground truncate text-xs">
                    {m.user.email}
                  </div>
                </div>
                {!canEdit && (
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {m.roleLabel ||
                      MEMBER_ROLE_OPTIONS.find((o) => o.value === m.role)?.label}
                  </span>
                )}
              </div>

              {canEdit && (
                <div className="mt-2 flex flex-wrap items-center gap-1 pl-11">
                  <input
                    type="text"
                    defaultValue={m.roleLabel ?? ""}
                    placeholder="職位"
                    title="職位（自由文字，例：PM / 工程 / 設計）"
                    disabled={pending}
                    onBlur={(e) => {
                      if (e.target.value !== (m.roleLabel ?? "")) {
                        run(
                          () =>
                            updateMember({
                              memberId: m.id,
                              projectId,
                              roleLabel: e.target.value,
                            }),
                          "已更新職位",
                        );
                      }
                    }}
                    className={selectClass + " w-20"}
                  />
                  <select
                    value={m.role}
                    disabled={pending}
                    onChange={(e) =>
                      run(
                        () =>
                          updateMember({
                            memberId: m.id,
                            projectId,
                            role: e.target.value as Member["role"],
                          }),
                        "已更新角色",
                      )
                    }
                    className={selectClass}
                  >
                    {MEMBER_ROLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {!isOwner && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="設為負責人"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => setOwner({ projectId, userId: m.user.id }),
                          "已設為負責人",
                        )
                      }
                    >
                      <Crown className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="移除"
                    disabled={pending}
                    onClick={() => {
                      if (
                        !confirm(`確定將成員 ${displayName(m.user)} 移出此專案嗎？`)
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
              )}
            </li>
          );
        })}
        {members.length === 0 && (
          <li className="text-muted-foreground py-3 text-sm">尚未指派成員</li>
        )}
      </ul>

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
                {MEMBER_ROLE_OPTIONS.map((o) => (
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
