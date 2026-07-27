"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Crown,
  Briefcase,
  BadgeCheck,
  ShieldCheck,
  CalendarClock,
} from "lucide-react";
import type { HrDirectoryEntry, HrMonthlyRow } from "@/server/queries";
import {
  setMemberJobTitle,
  setMemberDepartment,
  setMemberHireDate,
  setMemberManager,
  setMemberSecondaryManagers,
  setMemberActive,
  setMemberRoles,
} from "@/server/actions/team";
import { formatSeniority, specialLeaveDays } from "@/lib/leave-entitlement";
import { displayName, displayInitial } from "@/lib/display";
import { fmtDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { MemberName } from "@/components/member-name";
import { MemberDeleteButton } from "@/components/member-delete-button";
import { AttendanceMonthNav } from "@/components/attendance-month-nav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";

type RoleOption = { id: string; name: string; color: string | null };
type ManagerOption = { membershipId: string; label: string };
type HrTab = "roster" | "overview";

const inputCls =
  "border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-md border px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";
const PAGE_SIZE = 15;
const STATUS_FILTERS = [
  { key: "active", label: "在職" },
  { key: "all", label: "全部" },
  { key: "inactive", label: "停用" },
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number]["key"];

export function HrWorkspace({
  members,
  roles,
  departments,
  managerOptions,
  expandUserId,
  canPosition,
  canEmployment,
  canRoles,
  monthly,
  month,
  thisMonth,
  initialTab,
}: {
  members: HrDirectoryEntry[];
  roles: RoleOption[];
  departments: string[];
  managerOptions: ManagerOption[];
  expandUserId: string | null;
  canPosition: boolean;
  canEmployment: boolean;
  canRoles: boolean;
  monthly: { rows: HrMonthlyRow[]; expectedWorkdays: number };
  month: string;
  thisMonth: string;
  initialTab: HrTab;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<HrTab>(initialTab);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [page, setPage] = useState(0);

  const canEditAnything = canPosition || canEmployment || canRoles;
  const roleName = useMemo(
    () => new Map(roles.map((r) => [r.id, r])),
    [roles],
  );

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return members.filter((m) => {
      if (status === "active" && !m.active) return false;
      if (status === "inactive" && m.active) return false;
      if (!kw) return true;
      return [m.name, m.nickname, m.email, m.jobTitle, m.department]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(kw));
    });
  }, [members, q, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function setExpand(userId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (userId) params.set("expand", userId);
    else params.delete("expand");
    const qs = params.toString();
    router.replace(qs ? `/hr?${qs}` : "/hr", { scroll: false });
  }

  return (
    <div className="space-y-4">
      {/* 分頁：名冊 / 當月概況 */}
      <div className="flex items-center gap-1 border-b">
        <TabBtn active={tab === "roster"} onClick={() => setTab("roster")}>
          名冊
        </TabBtn>
        <TabBtn active={tab === "overview"} onClick={() => setTab("overview")}>
          當月概況
        </TabBtn>
      </div>

      {tab === "overview" && (
        <HrOverview
          rows={monthly.rows}
          expectedWorkdays={monthly.expectedWorkdays}
          month={month}
          thisMonth={thisMonth}
        />
      )}

      {tab === "roster" && (
      <div className="space-y-3">
      {/* 搜尋 + 在職篩選 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="搜尋姓名 / Email / 部門 / 職稱…"
            className="border-input h-9 w-full rounded-md border bg-transparent pr-3 pl-8 text-sm outline-none focus:border-ring"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-0.5 text-sm">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => {
                setStatus(f.key);
                setPage(0);
              }}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                status === f.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {!canEditAnything && (
        <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          你目前為唯讀檢視——如需編輯職務、任職狀態或角色，請由管理者指派對應的人事權限。
        </p>
      )}

      {/* 名冊 */}
      <div className="bg-card overflow-x-auto rounded-xl border">
        <div className="min-w-[820px]">
          <div className="text-muted-foreground bg-muted/50 flex items-center gap-3 border-b px-3 py-2 text-xs font-medium">
            <div className="w-6 shrink-0" />
            <div className="w-52 shrink-0">姓名</div>
            <div className="w-28 shrink-0">職稱</div>
            <div className="w-24 shrink-0">部門</div>
            <div className="w-24 shrink-0">到職日</div>
            <div className="w-24 shrink-0">年資</div>
            <div className="flex-1">角色</div>
            <div className="w-16 shrink-0 text-center">狀態</div>
          </div>

          <div className="divide-y">
            {pageItems.length === 0 ? (
              <div className="text-muted-foreground px-3 py-10 text-center text-sm">
                找不到符合的成員。
              </div>
            ) : (
              pageItems.map((m) => {
                const expanded = expandUserId === m.id;
                return (
                  <div key={m.membershipId}>
                    <button
                      type="button"
                      onClick={() => setExpand(expanded ? null : m.id)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2 text-left",
                        expanded ? "bg-primary/5" : "hover:bg-muted/40",
                      )}
                    >
                      <span className="flex w-6 shrink-0 justify-center text-muted-foreground">
                        {expanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </span>
                      <span className="flex w-52 shrink-0 items-center gap-2.5">
                        <Avatar className="h-8 w-8 shrink-0">
                          {m.image && <AvatarImage src={m.image} alt="" />}
                          <AvatarFallback className="text-xs">
                            {displayInitial(m)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <MemberName u={m} className="min-w-0 text-sm font-medium" />
                            {m.isBoss && (
                              <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                            )}
                            {(m.role === "OWNER" || m.role === "ADMIN") && (
                              <span className="shrink-0 rounded bg-violet-100 px-1.5 text-[10px] text-violet-700">
                                {m.role === "OWNER" ? "擁有者" : "管理者"}
                              </span>
                            )}
                          </span>
                          <span className="text-muted-foreground block truncate text-[11px]">
                            {m.email}
                          </span>
                        </span>
                      </span>
                      <span className="text-muted-foreground w-28 shrink-0 truncate text-sm">
                        {m.jobTitle || "—"}
                      </span>
                      <span className="w-24 shrink-0 truncate text-sm">
                        {m.department ? (
                          <span className="bg-muted rounded px-1.5 py-0.5 text-xs">
                            {m.department}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </span>
                      <span className="text-muted-foreground w-24 shrink-0 text-sm tabular-nums">
                        {m.hireDate ? fmtDate(m.hireDate) : "—"}
                      </span>
                      <span className="text-muted-foreground w-24 shrink-0 text-sm">
                        {formatSeniority(m.hireDate ? new Date(m.hireDate) : null, new Date())}
                      </span>
                      <span className="flex flex-1 flex-wrap gap-1">
                        {m.roleIds.length === 0 ? (
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : (
                          m.roleIds.map((rid) => {
                            const r = roleName.get(rid);
                            if (!r) return null;
                            return (
                              <span
                                key={rid}
                                className="rounded-full border px-1.5 py-0.5 text-[11px]"
                                style={{
                                  borderColor: r.color ?? "#cbd5e1",
                                  color: r.color ?? "#475569",
                                }}
                              >
                                {r.name}
                              </span>
                            );
                          })
                        )}
                      </span>
                      <span className="flex w-16 shrink-0 justify-center">
                        {m.active ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                            在職
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                            停用
                          </span>
                        )}
                      </span>
                    </button>

                    {expanded && (
                      <div className="bg-muted/20 border-t px-4 py-4">
                        <MemberEditor
                          member={m}
                          roles={roles}
                          departments={departments}
                          managerOptions={managerOptions}
                          canPosition={canPosition}
                          canEmployment={canEmployment}
                          canRoles={canRoles}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 分頁 */}
      <div className="text-muted-foreground flex items-center justify-between px-1 text-xs">
        <span>
          共 {filtered.length} 人
          {filtered.length !== members.length && ` · 全部 ${members.length}`}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className={cn(
                "hover:bg-muted inline-flex h-7 items-center rounded-md border px-2",
                safePage === 0 && "opacity-40",
              )}
            >
              上一頁
            </button>
            <span className="tabular-nums">
              第 {safePage + 1} / {totalPages} 頁
            </span>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
              disabled={safePage >= totalPages - 1}
              className={cn(
                "hover:bg-muted inline-flex h-7 items-center rounded-md border px-2",
                safePage >= totalPages - 1 && "opacity-40",
              )}
            >
              下一頁
            </button>
          </div>
        )}
      </div>
      </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "text-muted-foreground hover:text-foreground border-transparent",
      )}
    >
      {children}
    </button>
  );
}

/** 當月概況：一頁看每人本月出勤 / 缺勤 / 各假別請假 / 打卡完整度 / 特休剩餘。 */
function HrOverview({
  rows,
  expectedWorkdays,
  month,
  thisMonth,
}: {
  rows: HrMonthlyRow[];
  expectedWorkdays: number;
  month: string;
  thisMonth: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          本月應上班 <span className="text-foreground font-medium">{expectedWorkdays}</span> 天
          （平日，至今日止）。「打卡」＝有上班打卡的天數 / 上下班都齊全的天數。
        </p>
        <AttendanceMonthNav month={month} thisMonth={thisMonth} basePath="/hr" />
      </div>
      <div className="bg-card max-h-[62vh] overflow-auto rounded-xl border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted text-muted-foreground sticky top-0 z-10 text-xs">
            <tr>
              <th className="px-3 py-2 text-left font-medium">成員</th>
              <th className="px-3 py-2 text-center font-medium">出勤</th>
              <th className="px-3 py-2 text-center font-medium">缺勤</th>
              <th className="px-3 py-2 text-center font-medium">請假</th>
              <th className="px-3 py-2 text-left font-medium">假別明細</th>
              <th className="px-3 py-2 text-center font-medium">打卡</th>
              <th className="px-3 py-2 text-center font-medium">特休剩餘</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-muted-foreground px-3 py-10 text-center">
                  尚無在職成員資料。
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.membershipId} className="hover:bg-muted/30 border-t">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7 shrink-0">
                        {r.image && <AvatarImage src={r.image} alt="" />}
                        <AvatarFallback className="text-[10px]">
                          {displayInitial(r)}
                        </AvatarFallback>
                      </Avatar>
                      <MemberName u={r} className="text-sm font-medium" />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {r.present}
                    {r.offsite > 0 && (
                      <span className="text-muted-foreground text-xs"> (外 {r.offsite})</span>
                    )}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-center tabular-nums",
                      r.absent > 0 && "text-rose-600 font-medium",
                    )}
                  >
                    {r.absent}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">{r.leaveDays}</td>
                  <td className="px-3 py-2">
                    {r.leaveByType.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {r.leaveByType.map((l) => (
                          <span
                            key={l.name}
                            className="bg-muted rounded px-1.5 py-0.5 text-[11px]"
                          >
                            {l.name} {l.days}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    <span
                      className={cn(
                        r.clockInDays < expectedWorkdays && "text-amber-600",
                      )}
                    >
                      {r.clockInDays}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}/ {expectedWorkdays}
                    </span>
                    {r.completeDays < r.clockInDays && (
                      <span
                        className="text-muted-foreground text-[11px]"
                        title="上下班都齊全的天數"
                      >
                        {" "}
                        (齊 {r.completeDays})
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {r.specialRemaining != null ? (
                      <span>
                        {r.specialRemaining}
                        {r.specialTotal != null && (
                          <span className="text-muted-foreground text-xs">
                            {" "}/ {r.specialTotal}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground" title="未填到職日">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 單一成員的人事編輯面板：分「任職資訊 / 任職狀態 / 角色」三段，各段依權限顯示。 */
function MemberEditor({
  member: m,
  roles,
  departments,
  managerOptions,
  canPosition,
  canEmployment,
  canRoles,
}: {
  member: HrDirectoryEntry;
  roles: RoleOption[];
  departments: string[];
  managerOptions: ManagerOption[];
  canPosition: boolean;
  canEmployment: boolean;
  canRoles: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // 受控欄位（即時儲存；文字欄失焦時比對後才寫入）。
  const [jobTitle, setJobTitle] = useState(m.jobTitle ?? "");
  const [department, setDepartment] = useState(m.department ?? "");
  const [hireDate, setHireDate] = useState(m.hireDate ?? "");

  const otherManagers = managerOptions.filter((o) => o.membershipId !== m.membershipId);

  function run(
    fn: () => Promise<{ ok: boolean; error?: string } | void>,
    msg: string,
  ) {
    start(async () => {
      try {
        const res = await fn();
        if (res && !res.ok) {
          toast.error(res.error ?? "儲存失敗");
          return;
        }
        toast.success(msg);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "儲存失敗");
      }
    });
  }

  function commitText(
    next: string,
    original: string | null,
    fn: (v: string) => Promise<{ ok: boolean; error?: string } | void>,
    msg: string,
  ) {
    if (next.trim() === (original ?? "").trim()) return;
    run(() => fn(next), msg);
  }

  const seniority = formatSeniority(hireDate ? new Date(hireDate) : null, new Date());
  const special = specialLeaveDays(hireDate ? new Date(hireDate) : null, new Date());

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* 任職資訊 */}
      {canPosition && (
        <Section icon={<Briefcase className="h-4 w-4" />} title="任職資訊">
          <Field label="職稱">
            <input
              className={inputCls}
              value={jobTitle}
              disabled={pending}
              placeholder="例：資深工程師"
              onChange={(e) => setJobTitle(e.target.value)}
              onBlur={() =>
                commitText(jobTitle, m.jobTitle, (v) => setMemberJobTitle(m.id, v), "已更新職稱")
              }
            />
          </Field>
          <Field label="部門">
            <input
              className={inputCls}
              value={department}
              disabled={pending}
              list="hr-departments"
              placeholder="例：研發部"
              onChange={(e) => setDepartment(e.target.value)}
              onBlur={() =>
                commitText(department, m.department, (v) => setMemberDepartment(m.id, v), "已更新部門")
              }
            />
            <datalist id="hr-departments">
              {departments.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </Field>
          <Field label="直屬主管">
            <select
              className={inputCls}
              value={m.managerId ?? ""}
              disabled={pending}
              onChange={(e) =>
                run(
                  () => setMemberManager(m.id, e.target.value || null),
                  "已更新直屬主管",
                )
              }
            >
              <option value="">（無）</option>
              {otherManagers.map((o) => (
                <option key={o.membershipId} value={o.membershipId}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="協同主管">
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-2">
              {otherManagers.length === 0 ? (
                <p className="text-muted-foreground text-xs">無其他成員</p>
              ) : (
                otherManagers.map((o) => {
                  const checked = m.secondaryManagerIds.includes(o.membershipId);
                  return (
                    <label
                      key={o.membershipId}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="accent-primary h-4 w-4"
                        checked={checked}
                        disabled={pending}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...m.secondaryManagerIds, o.membershipId]
                            : m.secondaryManagerIds.filter((x) => x !== o.membershipId);
                          run(
                            () => setMemberSecondaryManagers(m.id, next),
                            "已更新協同主管",
                          );
                        }}
                      />
                      <span className="min-w-0 truncate">{o.label}</span>
                    </label>
                  );
                })
              )}
            </div>
            <p className="text-muted-foreground text-[11px]">
              協同主管（虛線回報）與直屬主管一樣能在每日報告看到並回饋此成員。
            </p>
          </Field>
        </Section>
      )}

      {/* 任職狀態 */}
      {canEmployment && (
        <Section icon={<BadgeCheck className="h-4 w-4" />} title="任職狀態">
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <div className="text-sm font-medium">在職</div>
              <p className="text-muted-foreground text-xs">
                停用後不列入出勤 / 薪資，也無法登入本組織資料。
              </p>
            </div>
            <Switch
              checked={m.active}
              disabled={pending}
              onCheckedChange={(v) =>
                run(() => setMemberActive(m.id, v), v ? "已設為在職" : "已設為停用")
              }
            />
          </div>
          <Field label="到職日">
            <input
              type="date"
              className={inputCls}
              value={hireDate}
              disabled={pending}
              onChange={(e) => {
                setHireDate(e.target.value);
                run(() => setMemberHireDate(m.id, e.target.value), "已更新到職日");
              }}
            />
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
              {hireDate ? (
                <span>
                  年資 {seniority}
                  {special != null && ` · 依勞基法§38 特休 ${special} 天`}
                </span>
              ) : (
                <span>填入到職日後可自動計算年資與法定特休。</span>
              )}
            </div>
          </Field>
          <div className="rounded-md border border-red-200 bg-red-50/40 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-red-700">移除成員</div>
                <p className="text-muted-foreground text-xs">
                  將此成員自本組織移除，其負責的專案轉由你接手。無法復原。
                </p>
              </div>
              <MemberDeleteButton id={m.id} name={displayName(m)} mode="button" />
            </div>
          </div>
        </Section>
      )}

      {/* 角色與權限 */}
      {canRoles && (
        <Section icon={<ShieldCheck className="h-4 w-4" />} title="角色與權限">
          {roles.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              尚未建立任何自訂角色。到{" "}
              <Link href="/team" className="text-primary underline">
                團隊 → 角色權限
              </Link>{" "}
              建立角色（如人資 / 會計）後即可在此指派。
            </p>
          ) : (
            <div className="space-y-1.5">
              {roles.map((r) => {
                const checked = m.roleIds.includes(r.id);
                return (
                  <label
                    key={r.id}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="accent-primary h-4 w-4"
                      checked={checked}
                      disabled={pending}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...m.roleIds, r.id]
                          : m.roleIds.filter((x) => x !== r.id);
                        run(() => setMemberRoles(m.id, next), "已更新角色指派");
                      }}
                    />
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: r.color ?? "#94a3b8" }}
                    />
                    <span>{r.name}</span>
                  </label>
                );
              })}
            </div>
          )}
          <p className="text-muted-foreground text-[11px]">
            角色決定這位成員能看到哪些頁面、能執行哪些管理操作。
          </p>
        </Section>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
