import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Crown,
  FolderKanban,
  Users2,
  FileText,
  CalendarCheck,
  CalendarRange,
  CheckCircle2,
  Circle,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth-helpers";
import { getMemberProfile } from "@/server/queries";
import { thisWeekStart, weekLabel } from "@/lib/date";
import { displayName, displayInitial } from "@/lib/display";
import { MemberName } from "@/components/member-name";
import { ProfileForm } from "@/components/profile-form";
import { MemberDeleteButton } from "@/components/member-delete-button";
import { MemberEventsPanel } from "@/components/member-events-panel";
import { HealthDot, HealthBadge, TypeBadge, MemberRoleBadge } from "@/components/badges";
import { ProgressBar } from "@/components/progress-bar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireUser();
  const m = await getMemberProfile(id);
  if (!m) notFound();

  const week = thisWeekStart();
  const owned = m.ownedProjects;
  const updatedOwned = owned.filter(
    (p) => p.weeklyUpdates[0]?.weekStart.getTime() === week.getTime(),
  ).length;
  const initials = displayInitial(m);

  // 被指派的任務（跨各專案週報），最近的週在前
  const assignedTasks = [...m.weeklyTasks].sort(
    (a, b) =>
      b.weeklyUpdate.weekStart.getTime() - a.weeklyUpdate.weekStart.getTime(),
  );
  const openTaskCount = assignedTasks.filter((t) => !t.done).length;

  return (
    <div className="space-y-5">
      <Link
        href="/team"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" /> 返回團隊
      </Link>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 pt-6">
          <Avatar className="h-16 w-16">
            {m.image && <AvatarImage src={m.image} alt="" />}
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MemberName u={m} className="text-2xl font-bold" />
              {m.isBoss && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  <Crown className="h-3 w-3" /> 老闆
                </span>
              )}
              {!m.active && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  停用
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              {m.jobTitle ? `${m.jobTitle} · ` : ""}
              {m.email}
            </p>
            {m.attendance && (
              <p className="text-muted-foreground mt-1 text-xs">
                出席：{m.attendance}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 編輯 profile + 事件紀錄 */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>個人 Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <ProfileForm
                values={{
                  id: m.id,
                  name: m.name,
                  nickname: m.nickname,
                  useNickname: m.useNickname,
                  email: m.email,
                  jobTitle: m.jobTitle,
                  attendance: m.attendance,
                  persona: m.persona,
                  personality: m.personality,
                  bio: m.bio,
                  productivityNote: m.productivityNote,
                  isBoss: m.isBoss,
                  active: m.active,
                }}
              />
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

        {/* 生產力 */}
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Stat icon={<FolderKanban className="h-4 w-4" />} label="負責專案" value={owned.length} />
            <Stat icon={<Users2 className="h-4 w-4" />} label="參與專案" value={m.memberships.length} />
            <Stat icon={<FileText className="h-4 w-4" />} label="累積週報" value={m.weeklyUpdates.length >= 8 ? "8+" : m.weeklyUpdates.length} />
            <Stat
              icon={<CalendarCheck className="h-4 w-4" />}
              label="本週更新"
              value={`${updatedOwned}/${owned.length}`}
              highlight={owned.length > 0 && updatedOwned === owned.length}
            />
          </div>

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
                  {assignedTasks.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 px-4 py-2 text-sm"
                    >
                      {t.done ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <Circle className="text-muted-foreground h-4 w-4 shrink-0" />
                      )}
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate",
                          t.done && "text-muted-foreground line-through",
                        )}
                      >
                        {t.title}
                      </span>
                      <Link
                        href={`/projects/${t.weeklyUpdate.project.id}`}
                        className="text-muted-foreground hidden max-w-[8rem] truncate text-xs hover:underline sm:inline"
                      >
                        {t.weeklyUpdate.project.name}
                      </Link>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {weekLabel(t.weeklyUpdate.weekStart)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>負責的專案</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {owned.length === 0 ? (
                <p className="text-muted-foreground px-4 pb-4 text-sm">尚未負責任何專案</p>
              ) : (
                <div className="divide-y">
                  {owned.map((p) => {
                    const updated =
                      p.weeklyUpdates[0]?.weekStart.getTime() === week.getTime();
                    return (
                      <Link
                        key={p.id}
                        href={`/projects/${p.id}`}
                        className="hover:bg-muted/40 flex items-center gap-2 px-4 py-2.5 text-sm"
                      >
                        <HealthDot health={p.health} />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {p.name}
                        </span>
                        <TypeBadge type={p.type} />
                        <div className="w-24">
                          <ProgressBar value={p.progress} />
                        </div>
                        {updated ? (
                          <span className="text-[11px] text-emerald-600">本週已更新</span>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">未更新</span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>近期週報活動</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {m.weeklyUpdates.length === 0 ? (
                <p className="text-muted-foreground px-4 pb-4 text-sm">尚無週報紀錄</p>
              ) : (
                <div className="divide-y">
                  {m.weeklyUpdates.map((u) => (
                    <Link
                      key={u.id}
                      href={`/projects/${u.project.id}`}
                      className="hover:bg-muted/40 flex items-center gap-2 px-4 py-2 text-sm"
                    >
                      <span className="text-muted-foreground w-24 shrink-0 text-xs">
                        {weekLabel(u.weekStart)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{u.project.name}</span>
                      <HealthBadge health={u.health} />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {m.memberships.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>參與的專案</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {m.memberships
                    .filter((mm) => !mm.project.archived)
                    .map((mm) => (
                      <Link
                        key={mm.id}
                        href={`/projects/${mm.project.id}`}
                        className="hover:bg-muted/40 flex items-center gap-2 px-4 py-2 text-sm"
                      >
                        <HealthDot health={mm.project.health} />
                        <span className="min-w-0 flex-1 truncate">
                          {mm.project.name}
                        </span>
                        <MemberRoleBadge role={mm.role} label={mm.roleLabel} />
                      </Link>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-red-200 bg-red-50/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-red-700">刪除成員</div>
            <p className="text-muted-foreground text-xs">
              將此成員從工作區移除；他建立 / 負責的專案會轉由你接手，成員資格一併移除。此動作無法復原。
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
      <CardContent className="flex items-center gap-2.5 p-3">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-md ${
            highlight ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-600"
          }`}
        >
          {icon}
        </span>
        <div>
          <div className="text-xl leading-none font-bold">{value}</div>
          <div className="text-muted-foreground text-[11px]">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
