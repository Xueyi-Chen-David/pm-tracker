import { GraduationCap, CheckCircle2, AlertTriangle, RefreshCw, Plus } from "lucide-react";
import { requireManageContext } from "@/server/org";
import {
  getMyTrainingAssignments,
  getTrainingCourses,
  getOrgMemberUsers,
} from "@/server/queries";
import { isTrainingOverdue, needsRenewal } from "@/lib/training";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrainingAssignmentCard } from "@/components/training/training-assignment-card";
import { TrainingCourseCard } from "@/components/training/training-course-card";
import { TrainingCourseDialog } from "@/components/training/training-course-dialog";

export const metadata = { title: "員工教育訓練 · Project Pulse" };

export default async function TrainingPage() {
  const { org, user, canManage } = await requireManageContext();

  const [myAssignments, courses, members] = await Promise.all([
    getMyTrainingAssignments(org.id, user.id),
    canManage ? getTrainingCourses(org.id) : Promise.resolve([]),
    canManage ? getOrgMemberUsers(org.id) : Promise.resolve([]),
  ]);

  // 我的訓練摘要。
  const total = myAssignments.length;
  const completed = myAssignments.filter((a) => a.status === "COMPLETED").length;
  const overdue = myAssignments.filter((a) =>
    isTrainingOverdue(a.dueDate, a.status),
  ).length;
  const renew = myAssignments.filter((a) =>
    needsRenewal(a.completedAt, a.course.renewMonths),
  ).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="員工教育訓練"
        description="指派的課程、完成進度與必修 / 法遵訓練追蹤。"
      >
        {canManage && (
          <TrainingCourseDialog
            trigger={
              <Button className="gap-1.5">
                <Plus className="h-4 w-4" /> 新增課程
              </Button>
            }
          />
        )}
      </PageHeader>

      {/* 我的訓練摘要 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          icon={<GraduationCap className="h-4 w-4" />}
          label="指派課程"
          value={total}
        />
        <StatTile
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="已完成"
          value={`${completed}/${total}`}
          tone={total > 0 && completed === total ? "emerald" : undefined}
        />
        <StatTile
          icon={<AlertTriangle className="h-4 w-4" />}
          label="逾期"
          value={overdue}
          tone={overdue > 0 ? "rose" : undefined}
        />
        <StatTile
          icon={<RefreshCw className="h-4 w-4" />}
          label="需重訓"
          value={renew}
          tone={renew > 0 ? "amber" : undefined}
        />
      </div>

      {/* 我的訓練 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <GraduationCap className="h-4 w-4" /> 我的訓練
          </CardTitle>
        </CardHeader>
        <CardContent>
          {myAssignments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              目前沒有被指派的訓練課程。
            </p>
          ) : (
            <div className="space-y-2.5">
              {myAssignments.map((a) => (
                <TrainingAssignmentCard
                  key={a.id}
                  a={{
                    id: a.id,
                    status: a.status,
                    dueDate: a.dueDate,
                    completedAt: a.completedAt,
                    course: {
                      title: a.course.title,
                      description: a.course.description,
                      category: a.course.category,
                      format: a.course.format,
                      resourceUrl: a.course.resourceUrl,
                      estimatedMin: a.course.estimatedMin,
                      required: a.course.required,
                      renewMonths: a.course.renewMonths,
                    },
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 課程管理（管理者） */}
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span>課程管理</span>
              <span className="text-muted-foreground text-xs font-normal">
                {courses.length} 門課程
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {courses.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                還沒有課程。點右上「新增課程」建立第一門，再指派給成員。
              </p>
            ) : (
              <div className="space-y-3">
                {courses.map((c) => {
                  const stats = {
                    total: c.assignments.length,
                    completed: c.assignments.filter(
                      (x) => x.status === "COMPLETED",
                    ).length,
                    overdue: c.assignments.filter((x) =>
                      isTrainingOverdue(x.dueDate, x.status),
                    ).length,
                  };
                  return (
                    <TrainingCourseCard
                      key={c.id}
                      course={{
                        id: c.id,
                        title: c.title,
                        description: c.description,
                        category: c.category,
                        format: c.format,
                        resourceUrl: c.resourceUrl,
                        estimatedMin: c.estimatedMin,
                        required: c.required,
                        renewMonths: c.renewMonths,
                        active: c.active,
                      }}
                      stats={stats}
                      assignedUserIds={c.assignments.map((x) => x.userId)}
                      members={members}
                    />
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: "emerald" | "rose" | "amber";
}) {
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-100 text-emerald-600"
      : tone === "rose"
        ? "bg-rose-100 text-rose-600"
        : tone === "amber"
          ? "bg-amber-100 text-amber-600"
          : "bg-slate-100 text-slate-600";
  return (
    <Card>
      <CardContent className="flex items-center gap-2.5 p-3">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-md ${toneClass}`}
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
