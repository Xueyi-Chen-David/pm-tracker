import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Crown,
  FolderKanban,
  Users2,
  CalendarCheck,
  CalendarRange,
  CheckCircle2,
  Circle,
  ListChecks,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { db } from "@/server/db";
import { requireManageContext } from "@/server/org";
import {
  getMemberProfile,
  getOrgMemberDirectory,
} from "@/server/queries";
import { fmtDateShort } from "@/lib/date";
import { displayName, displayInitial } from "@/lib/display";
import { MemberName } from "@/components/member-name";
import { AvatarUploader } from "@/components/avatar-uploader";
import { ProfileForm } from "@/components/profile-form";
import { MyProfileForm } from "@/components/my-profile-form";
import { MemberDeleteButton } from "@/components/member-delete-button";
import { MemberEventsPanel } from "@/components/member-events-panel";
import { HealthDot, TypeBadge } from "@/components/badges";
import { ProgressBar } from "@/components/progress-bar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { org, user, canManage } = await requireManageContext();
  const m = await getMemberProfile(org.id, id);
  if (!m) notFound();
  const isSelf = m.id === user.id; // m.id ＝ userId

  // 名錄：主管下拉選單（僅管理者用）＋ 解析「額外回報對象」的顯示名稱（所有人可見）。
  const directory = await getOrgMemberDirectory(org.id);
  const memberOptions = directory.map((d) => ({
    membershipId: d.membershipId,
    label: d.jobTitle ? `${displayName(d)}（${d.jobTitle}）` : displayName(d),
  }));
  const secondaryNames = (m.secondaryManagerIds ?? [])
    .map((mid) => directory.find((d) => d.membershipId === mid))
    .filter((d): d is (typeof directory)[number] => Boolean(d))
    .map((d) => displayName(d))
    .join("、");

  // 參與的專案：負責 + 參與合成單一清單（負責的 tag「負責」），排除封存 / 暫停。
  const ownedList = m.ownedProjects
    .filter((p) => p.status !== "ON_HOLD")
    .map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      health: p.health,
      progress: p.progress,
      isOwner: true,
    }));
  const ownedIds = new Set(ownedList.map((p) => p.id));
  // 參與的專案＝有負責任務的專案（已於查詢排除封存），再排除進行暫停 / 自己負責的。
  const memberList = m.participatingProjects
    .filter((p) => p.status !== "ON_HOLD" && !ownedIds.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      health: p.health,
      progress: p.progress,
      isOwner: false,
    }));
  const participating = [...ownedList, ...memberList].sort(
    (a, b) =>
      Number(b.isOwner) - Number(a.isOwner) ||
      a.name.localeCompare(b.name, "zh-Hant"),
  );
  const ownedCount = ownedList.length;
  const initials = displayInitial(m);

  // 被指派的任務：以「專案與任務」頁的真實 Task 為唯一來源。
  const assignedTasks = m.tasksOwned;
  const openTaskCount = assignedTasks.filter(
    (t) => t.status !== "DONE" && t.status !== "CANCELLED",
  ).length;

  // 出席統計 + 每日報告統計（本月）。
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1));
  const [attRecords, dailyCount, lastDaily] = await Promise.all([
    db.attendanceRecord.findMany({
      where: {
        organizationId: org.id,
        userId: id,
        date: { gte: monthStart, lt: nextMonth },
      },
      select: { present: true, offsite: true, holiday: true, leave: true },
    }),
    db.dailyReport.count({
      where: {
        organizationId: org.id,
        userId: id,
        date: { gte: monthStart, lt: nextMonth },
      },
    }),
    db.dailyReport.findFirst({
      where: { organizationId: org.id, userId: id },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
  ]);
  const attPresent = attRecords.filter((r) => r.present && !r.offsite).length;
  const attOffsite = attRecords.filter((r) => r.offsite).length;
  // 休假 / 請假既不算出席也不算缺席，從缺席統計排除。
  const attAbsent = attRecords.filter(
    (r) => !r.present && !r.holiday && !r.leave,
  ).length;
  const lastDailyLabel = lastDaily ? fmtDateShort(lastDaily.date) : null;

  return (
    <div className="space-y-5">
      {!isSelf && (
        <Link
          href="/team"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> 返回團隊
        </Link>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 pt-6">
          {isSelf || canManage ? (
            // 本人或管理者：頭貼可點擊上傳 / 移除。
            <AvatarUploader userId={m.id} image={m.image} fallback={initials} />
          ) : (
            <Avatar className="h-16 w-16">
              {m.image && <AvatarImage src={m.image} alt="" />}
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MemberName u={m} className="text-2xl font-bold" />
              {(canManage || isSelf) && m.isBoss && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  <Crown className="h-3 w-3" /> 老闆
                </span>
              )}
              {(canManage || isSelf) && !m.active && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  停用
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              {m.jobTitle ? `${m.jobTitle} · ` : ""}
              {m.email}
            </p>
            {m.manager && (
              <p className="text-muted-foreground mt-1 text-xs">
                上級主管：{displayName(m.manager.user)}
              </p>
            )}
            {secondaryNames && (
              <p className="text-muted-foreground mt-1 text-xs">
                另外回報給：{secondaryNames}
              </p>
            )}
            {m.attendance && (
              <p className="text-muted-foreground mt-1 text-xs">
                出席：{m.attendance}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 生產力總覽：橫跨全寬、置於所有 section 之上 */}
      <div className="grid grid-cols-3 gap-2">
        <Stat icon={<Users2 className="h-4 w-4" />} label="參與專案" value={participating.length} />
        <Stat icon={<FolderKanban className="h-4 w-4" />} label="其中負責" value={ownedCount} />
        <Stat
          icon={<ListChecks className="h-4 w-4" />}
          label="待辦任務"
          value={openTaskCount}
          highlight={openTaskCount === 0 && assignedTasks.length > 0}
        />
      </div>

      {/* 出席統計 + 每日報告統計（本月） */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-base">
              <CalendarCheck className="h-4 w-4" /> 出席統計
              <span className="text-muted-foreground text-xs font-normal">
                · 本月
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-emerald-50 py-2">
                <div className="text-xl font-bold tabular-nums text-emerald-600">
                  {attPresent}
                </div>
                <div className="text-muted-foreground text-[11px]">出席</div>
              </div>
              <div className="rounded-md bg-rose-50 py-2">
                <div className="text-xl font-bold tabular-nums text-rose-600">
                  {attAbsent}
                </div>
                <div className="text-muted-foreground text-[11px]">缺席</div>
              </div>
              <div className="rounded-md bg-sky-50 py-2">
                <div className="text-xl font-bold tabular-nums text-sky-600">
                  {attOffsite}
                </div>
                <div className="text-muted-foreground text-[11px]">在外</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-base">
              <ClipboardList className="h-4 w-4" /> 每日報告
              <span className="text-muted-foreground text-xs font-normal">
                · 本月
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-3">
              <div>
                <span className="text-2xl font-bold tabular-nums">
                  {dailyCount}
                </span>
                <span className="text-muted-foreground text-sm"> 天已填</span>
              </div>
              {lastDailyLabel && (
                <span className="text-muted-foreground text-xs">
                  最近：{lastDailyLabel}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 編輯 profile + 事件紀錄 */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>{isSelf && !canManage ? "我的資料" : "個人 Profile"}</CardTitle>
            </CardHeader>
            <CardContent>
              {canManage ? (
                <ProfileForm
                  values={{
                    id: m.id,
                    membershipId: m.membershipId,
                    name: m.name,
                    nickname: m.nickname,
                    useNickname: m.useNickname,
                    email: m.email,
                    jobTitle: m.jobTitle,
                    department: m.department,
                    attendance: m.attendance,
                    bio: m.bio,
                    isBoss: m.isBoss,
                    active: m.active,
                    trackAttendance: m.trackAttendance,
                    managerId: m.managerId,
                  }}
                  memberOptions={memberOptions}
                  departments={Array.from(
                    new Set(
                      directory
                        .map((d) => d.department?.trim())
                        .filter(Boolean) as string[],
                    ),
                  ).sort((a, b) => a.localeCompare(b, "zh-Hant"))}
                />
              ) : isSelf ? (
                // 本人（非管理者）：可自行編輯姓名 / 綽號 / Email / 簡介。
                <MyProfileForm
                  values={{
                    name: m.name,
                    nickname: m.nickname,
                    useNickname: m.useNickname,
                    email: m.email,
                    bio: m.bio,
                  }}
                />
              ) : (
                <dl className="space-y-2.5 text-sm">
                  <ReadOnlyRow label="職稱" value={m.jobTitle} />
                  <ReadOnlyRow label="Email" value={m.email} />
                  <ReadOnlyRow label="出席情況" value={m.attendance} />
                  <ReadOnlyRow
                    label="上級主管"
                    value={m.manager ? displayName(m.manager.user) : null}
                  />
                  <ReadOnlyRow label="另外回報給" value={secondaryNames || null} />
                  <ReadOnlyRow label="簡介 / 備註" value={m.bio} />
                </dl>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 生產力 */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <ListChecks className="h-4 w-4" /> 被指派的任務
                {openTaskCount > 0 && (
                  <span className="bg-primary/10 text-primary rounded-full px-1.5 text-xs">
                    {openTaskCount} 待辦
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {assignedTasks.length === 0 ? (
                <p className="text-muted-foreground px-4 pb-4 text-sm">
                  尚無被指派的任務
                </p>
              ) : (
                <div className="scroll-y max-h-72 divide-y overflow-y-auto">
                  {assignedTasks.map((t) => {
                    const done = t.status === "DONE";
                    return (
                      <div
                        key={t.id}
                        className="flex items-center gap-2 px-4 py-2 text-sm"
                      >
                        {done ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                        ) : (
                          <Circle className="text-muted-foreground h-4 w-4 shrink-0" />
                        )}
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate",
                            done && "text-muted-foreground line-through",
                          )}
                        >
                          {t.title}
                        </span>
                        <Link
                          href={`/projects/${t.project.id}`}
                          className="text-muted-foreground hidden max-w-[8rem] truncate text-xs hover:underline sm:inline"
                        >
                          {t.project.name}
                        </Link>
                        {t.dueDate && (
                          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                            {fmtDateShort(t.dueDate)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>參與的專案</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {participating.length === 0 ? (
                <p className="text-muted-foreground px-4 pb-4 text-sm">尚未參與任何專案</p>
              ) : (
                <div className="divide-y">
                  {participating.map((p) => (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="hover:bg-muted/40 flex items-center gap-2 px-4 py-2.5 text-sm"
                    >
                      <HealthDot health={p.health} />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {p.name}
                      </span>
                      {p.isOwner && (
                        <span className="shrink-0 rounded bg-violet-100 px-1.5 text-[10px] font-medium text-violet-700">
                          負責
                        </span>
                      )}
                      <TypeBadge type={p.type} />
                      <div className="w-24">
                        <ProgressBar value={p.progress} />
                      </div>
                      <span className="text-muted-foreground w-9 shrink-0 text-right text-[11px] tabular-nums">
                        {p.progress}%
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <CalendarRange className="h-4 w-4" /> 請假 / 出差 / 事件
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MemberEventsPanel
                userId={m.id}
                events={m.memberEvents.map((ev) => ({
                  id: ev.id,
                  type: ev.type,
                  startDate: ev.startDate,
                  endDate: ev.endDate,
                  note: ev.note,
                }))}
              />
            </CardContent>
          </Card>

        </div>
      </div>

      {canManage && !isSelf && (
        <div className="rounded-xl border border-red-200 bg-red-50/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-red-700">移除成員</div>
              <p className="text-muted-foreground text-xs">
                將此成員從目前組織移除；他在本組織建立 / 負責的專案會轉由你接手，成員資格一併移除（不影響其他組織）。此動作無法復原。
              </p>
            </div>
            <MemberDeleteButton
              id={m.id}
              name={displayName(m)}
              mode="button"
              redirectTo="/team"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ReadOnlyRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex gap-3">
      <dt className="text-muted-foreground w-24 shrink-0">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{value?.trim() || "—"}</dd>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-1 p-2.5 text-center">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-md ${
            highlight ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-600"
          }`}
        >
          {icon}
        </span>
        <div className="text-lg leading-none font-bold tabular-nums">{value}</div>
        <div className="text-muted-foreground text-[10px] leading-tight">
          {label}
        </div>
      </CardContent>
    </Card>
  );
}
