"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Crown, Building2, CornerDownRight, Users, X } from "lucide-react";
import {
  setMemberManager,
  setMemberDepartment,
  setMemberSecondaryManagers,
} from "@/server/actions/team";
import { displayName, displayInitial } from "@/lib/display";
import { MemberName } from "@/components/member-name";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OrgChartGraph } from "@/components/org-chart-graph";
import type { OrgChartEntry } from "@/components/org-chart";

const UNASSIGNED = "未分部門";
const DEPT_LIST_ID = "org-departments";

export function OrgStructureEditor({
  members,
  canManage,
}: {
  members: OrgChartEntry[];
  canManage: boolean;
}) {
  // 現有部門清單（給 datalist 快速選）。
  const departments = useMemo(
    () =>
      Array.from(
        new Set(
          members.map((m) => m.department?.trim()).filter(Boolean) as string[],
        ),
      ).sort((a, b) => a.localeCompare(b, "zh-Hant")),
    [members],
  );

  // 依部門分組（未分部門排最後）。
  const groups = useMemo(() => {
    const map = new Map<string, OrgChartEntry[]>();
    for (const m of members) {
      const key = m.department?.trim() || UNASSIGNED;
      const arr = map.get(key);
      if (arr) arr.push(m);
      else map.set(key, [m]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === UNASSIGNED) return 1;
      if (b === UNASSIGNED) return -1;
      return a.localeCompare(b, "zh-Hant");
    });
  }, [members]);

  return (
    <div className="space-y-6">
      {/* 視覺組織圖 */}
      <div>
        <h3 className="mb-2 text-sm font-semibold">組織圖</h3>
        <OrgChartGraph members={members} />
      </div>

      {/* 部門 / 直屬關係編輯 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">部門與直屬關係</h3>
          {canManage && (
            <span className="text-muted-foreground text-xs">
              就地設定每個人的部門、上級主管與額外回報對象；被指定者皆可在「每日報告」看到其日報。
            </span>
          )}
        </div>

        {canManage && (
          <datalist id={DEPT_LIST_ID}>
            {departments.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        )}

        <div className="space-y-4">
          {groups.map(([dept, list]) => (
            <div key={dept} className="bg-card overflow-hidden rounded-xl border">
              <div className="bg-muted/40 flex items-center gap-2 border-b px-3 py-2 text-sm font-medium">
                <Building2 className="text-muted-foreground h-4 w-4" />
                {dept}
                <span className="text-muted-foreground text-xs font-normal">
                  · {list.length} 人
                </span>
              </div>
              <div className="divide-y">
                {list.map((m) => (
                  <MemberRow
                    key={m.membershipId}
                    member={m}
                    allMembers={members}
                    canManage={canManage}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MemberRow({
  member,
  allMembers,
  canManage,
}: {
  member: OrgChartEntry;
  allMembers: OrgChartEntry[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dept, setDept] = useState(member.department ?? "");

  const manager = allMembers.find((x) => x.membershipId === member.managerId);
  const managerChoices = allMembers.filter(
    (x) => x.membershipId !== member.membershipId,
  );

  // 額外（虛線）回報對象。
  const secondaryIds = member.secondaryManagerIds ?? [];
  const secondaryMembers = secondaryIds
    .map((id) => allMembers.find((x) => x.membershipId === id))
    .filter((x): x is OrgChartEntry => Boolean(x));
  const secondaryChoices = allMembers.filter(
    (x) =>
      x.membershipId !== member.membershipId &&
      x.membershipId !== member.managerId &&
      !secondaryIds.includes(x.membershipId),
  );

  function setSecondary(ids: string[]) {
    run(() => setMemberSecondaryManagers(member.id, ids));
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string } | void>) {
    start(async () => {
      try {
        const res = await fn();
        if (res && !res.ok) {
          toast.error(res.error ?? "更新失敗");
          return;
        }
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "更新失敗");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
      {/* 成員 */}
      <div className="flex w-52 shrink-0 items-center gap-2.5">
        <Avatar className="h-8 w-8 shrink-0" title={displayName(member)}>
          {member.image && <AvatarImage src={member.image} alt="" />}
          <AvatarFallback className="text-xs">
            {displayInitial(member)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <MemberName u={member} className="min-w-0 text-sm font-medium" />
            {member.isBoss && (
              <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            )}
          </div>
          {member.jobTitle && (
            <div className="text-muted-foreground truncate text-[11px]">
              {member.jobTitle}
            </div>
          )}
        </div>
      </div>

      {canManage ? (
        <>
          {/* 部門 */}
          <label className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">部門</span>
            <input
              value={dept}
              list={DEPT_LIST_ID}
              disabled={pending}
              placeholder="未分部門"
              onChange={(e) => setDept(e.target.value)}
              onBlur={() => {
                const v = dept.trim();
                if (v !== (member.department ?? ""))
                  run(() => setMemberDepartment(member.id, v));
              }}
              className="border-input h-8 w-32 rounded-md border bg-transparent px-2 text-sm outline-none focus:border-ring"
            />
          </label>

          {/* 上級主管 */}
          <label className="flex items-center gap-1.5 text-xs">
            <CornerDownRight className="text-muted-foreground h-3.5 w-3.5" />
            <span className="text-muted-foreground">回報給</span>
            <select
              value={member.managerId ?? ""}
              disabled={pending}
              onChange={(e) =>
                run(() => setMemberManager(member.id, e.target.value || null))
              }
              className="border-input h-8 w-44 rounded-md border bg-transparent px-2 text-sm outline-none focus:border-ring"
            >
              <option value="">（無上級主管）</option>
              {managerChoices.map((c) => (
                <option key={c.membershipId} value={c.membershipId}>
                  {displayName(c)}
                  {c.jobTitle ? `（${c.jobTitle}）` : ""}
                </option>
              ))}
            </select>
          </label>

          {/* 額外回報對象（虛線 / 矩陣式；可多位） */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Users className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
            <span className="text-muted-foreground">另外回報給</span>
            {secondaryMembers.map((s) => (
              <span
                key={s.membershipId}
                className="bg-muted inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2"
              >
                {displayName(s)}
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`移除 ${displayName(s)}`}
                  onClick={() =>
                    setSecondary(
                      secondaryIds.filter((id) => id !== s.membershipId),
                    )
                  }
                  className="text-muted-foreground hover:text-foreground rounded-full disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {secondaryChoices.length > 0 ? (
              <select
                value=""
                disabled={pending}
                onChange={(e) => {
                  if (e.target.value)
                    setSecondary([...secondaryIds, e.target.value]);
                }}
                className="border-input h-8 w-32 rounded-md border bg-transparent px-2 text-sm outline-none focus:border-ring"
              >
                <option value="">＋ 新增…</option>
                {secondaryChoices.map((c) => (
                  <option key={c.membershipId} value={c.membershipId}>
                    {displayName(c)}
                    {c.jobTitle ? `（${c.jobTitle}）` : ""}
                  </option>
                ))}
              </select>
            ) : (
              secondaryMembers.length === 0 && (
                <span className="text-muted-foreground">—</span>
              )
            )}
          </div>
        </>
      ) : (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="flex items-center gap-1.5">
            <CornerDownRight className="h-3.5 w-3.5" />
            回報給 {manager ? displayName(manager) : "—"}
          </span>
          {secondaryMembers.length > 0 && (
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              另外回報給 {secondaryMembers.map((s) => displayName(s)).join("、")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
