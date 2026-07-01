import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus, CalendarRange, Target } from "lucide-react";
import { requireUser } from "@/server/auth-helpers";
import { getProject, getAllUsers } from "@/server/queries";
import { canEditProject } from "@/server/access";
import {
  HealthBadge,
  StatusBadge,
  PriorityBadge,
  TypeBadge,
} from "@/components/badges";
import { ProgressBar } from "@/components/progress-bar";
import { ProgressChart } from "@/components/progress-chart";
import { WeeklyHistory } from "@/components/weekly-history";
import { WeeklyUpdateDialog } from "@/components/weekly-update-dialog";
import { MembersPanel } from "@/components/members-panel";
import { MilestonesPanel } from "@/components/milestones-panel";
import { ProjectActions } from "@/components/project-actions";
import { ProjectStatusControl } from "@/components/project-status-control";
import { ActivityLog } from "@/components/activity-log";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDate, weekLabel, toDateInput, thisWeekStart } from "@/lib/date";
import { displayName, displayNameFull } from "@/lib/display";
import { MemberName } from "@/components/member-name";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const [project, allUsers] = await Promise.all([getProject(id), getAllUsers()]);
  if (!project) notFound();

  const canEdit = await canEditProject(user.id, id, user.isBoss);
  const accent = project.color ?? "#94a3b8";

  const chartData = project.weeklyUpdates.map((u) => ({
    label: weekLabel(u.weekStart),
    progress: u.progress,
    health: u.health,
  }));

  const historyItems = [...project.weeklyUpdates]
    .reverse()
    .map((u) => ({
      id: u.id,
      weekStart: u.weekStart.toISOString(),
      progress: u.progress,
      health: u.health,
      thisWeekGoals: u.thisWeekGoals,
      thisWeekDone: u.thisWeekDone,
      nextWeekGoals: u.nextWeekGoals,
      risks: u.risks,
      needsDecision: u.needsDecision,
      note: u.note,
      authorName: u.author ? displayName(u.author) : null,
      tasks: u.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        done: t.done,
        assigneeId: t.assigneeId,
        assigneeName: t.assignee ? displayName(t.assignee) : null,
      })),
    }));

  // 任務負責人候選：專案成員
  const memberOptions = project.members.map((m) => m.user);

  const activityItems = project.activities.map((a) => ({
    id: a.id,
    kind: a.kind,
    message: a.message,
    createdAt: a.createdAt.toISOString(),
    actorName: a.user ? displayNameFull(a.user) : null,
  }));

  const defaultWeekStart = toDateInput(thisWeekStart());

  return (
    <div className="space-y-5">
      <Link
        href="/projects"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" /> 返回專案列表
      </Link>

      {/* 標題卡 */}
      <Card className="relative overflow-hidden">
        <span
          className="absolute inset-y-0 left-0 w-1.5"
          style={{ backgroundColor: accent }}
        />
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <TypeBadge type={project.type} />
                <StatusBadge status={project.status} />
                <PriorityBadge priority={project.priority} />
                <HealthBadge health={project.health} />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
              {project.description && (
                <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm whitespace-pre-wrap">
                  {project.description}
                </p>
              )}
            </div>
            <ProjectActions
              projectId={project.id}
              archived={project.archived}
              canEdit={canEdit}
            />
          </div>

          {canEdit && (
            <ProjectStatusControl
              projectId={project.id}
              status={project.status}
              health={project.health}
              countInProgress={project.countInProgress}
            />
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="整體進度">
              <ProgressBar value={project.progress} />
            </Stat>
            <Stat label="負責人">
              <span className="text-sm font-medium">
                {project.owner ? <MemberName u={project.owner} /> : "未指派"}
              </span>
            </Stat>
            <Stat label="開始日">
              <span className="inline-flex items-center gap-1 text-sm font-medium">
                <CalendarRange className="text-muted-foreground h-4 w-4" />
                {fmtDate(project.startDate)}
              </span>
            </Stat>
            <Stat label="預計完成日（理想）">
              <span className="inline-flex items-center gap-1 text-sm font-medium">
                <Target className="text-muted-foreground h-4 w-4" />
                {fmtDate(project.targetDate)}
              </span>
            </Stat>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* 左：進度趨勢 + 每週歷史 */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>進度趨勢</CardTitle>
              {canEdit && (
                <WeeklyUpdateDialog
                  projectId={project.id}
                  defaultWeekStart={defaultWeekStart}
                  members={memberOptions}
                  trigger={
                    <Button size="sm">
                      <Plus className="h-4 w-4" /> 新增本週進度
                    </Button>
                  }
                />
              )}
            </CardHeader>
            <CardContent>
              <ProgressChart data={chartData} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>每週進度紀錄</CardTitle>
            </CardHeader>
            <CardContent>
              <WeeklyHistory
                projectId={project.id}
                items={historyItems}
                members={memberOptions}
                canEdit={canEdit}
              />
            </CardContent>
          </Card>
        </div>

        {/* 右：里程碑 → 成員 → 操作紀錄（各自限高、可捲動） */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>里程碑 / 目標</CardTitle>
            </CardHeader>
            <CardContent>
              <MilestonesPanel
                projectId={project.id}
                milestones={project.milestones}
                canEdit={canEdit}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>團隊成員</CardTitle>
            </CardHeader>
            <CardContent>
              <MembersPanel
                projectId={project.id}
                ownerId={project.ownerId}
                members={project.members}
                allUsers={allUsers}
                canEdit={canEdit}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>操作紀錄</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityLog
                projectId={project.id}
                items={activityItems}
                canEdit={canEdit}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground text-xs">{label}</div>
      {children}
    </div>
  );
}
