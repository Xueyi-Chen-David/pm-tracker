"use client";

import { useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Flag,
  History,
  ListChecks,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MilestonesPanel } from "@/components/milestones-panel";
import {
  ActivityTimeline,
  type ActivityItem,
} from "@/components/projects/activity-timeline";
import { ProjectGantt } from "@/components/projects/project-gantt";
import { TaskListPanel } from "@/components/projects/completed-tasks-panel";
import type { TaskView } from "@/components/tasks/task-row";

// 由子面板反推 prop 型別，避免重複定義又保證一致。
type Milestones = React.ComponentProps<typeof MilestonesPanel>["milestones"];

export function ProjectDetailTabs({
  projectId,
  canEdit,
  milestones,
  activity,
  tasks,
  color,
  tasksPanel,
  settings,
}: {
  projectId: string;
  canEdit: boolean;
  milestones: Milestones;
  /** 操作紀錄（軌跡）：狀態切換等變更歷程，含時間戳。 */
  activity: ActivityItem[];
  /** 專案的任務（供甘特圖 / 已完成分頁）。 */
  tasks: TaskView[];
  /** 專案顏色（甘特圖橫條色）。 */
  color: string | null;
  /** 「任務」分頁內容（任務表 + 新增任務，由卡片建立後傳入）。 */
  tasksPanel: React.ReactNode;
  /** 選填「設定」分頁內容（就地展開管理時傳入專案設定表單）。 */
  settings?: React.ReactNode;
}) {
  // 預設落在「任務」分頁——任務是專案的主體，展開就先看到它。
  const [tab, setTab] = useState("tasks");

  const doneCount = tasks.filter((t) => t.status === "DONE").length;
  const cancelledCount = tasks.filter((t) => t.status === "CANCELLED").length;
  // 「任務」分頁只算進行中的（已完成 / 已取消已歸檔到各自分頁）。
  const activeCount = tasks.length - doneCount - cancelledCount;

  // 分頁順序：任務 → 甘特圖 →（已完成）→（已取消）→ 里程碑 → 軌跡 →（設定，最後）。
  const TAB_META: { value: string; label: string; icon: typeof Flag }[] = [
    { value: "tasks", label: "任務", icon: ListChecks },
    { value: "gantt", label: "甘特圖", icon: BarChart3 },
    // 有已完成 / 已取消任務時才顯示對應分頁。
    ...(doneCount > 0
      ? [{ value: "done", label: "已完成", icon: CheckCircle2 }]
      : []),
    ...(cancelledCount > 0
      ? [{ value: "cancelled", label: "已取消", icon: XCircle }]
      : []),
    { value: "milestones", label: "里程碑", icon: Flag },
    { value: "activity", label: "軌跡", icon: History },
    ...(settings
      ? [{ value: "settings", label: "設定", icon: SlidersHorizontal }]
      : []),
  ];

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
      {/* 分頁列：只左右捲動（overflow-x-auto 會讓 overflow-y 隱含變 auto → 手機可斜向拖動，
          加 overflow-y-hidden + touch-pan-x 鎖成純水平）。 */}
      <div className="touch-pan-x overflow-x-auto overflow-y-hidden">
        <TabsList variant="line" className="w-max">
          {TAB_META.map((t) => {
            const Icon = t.icon;
            const count =
              t.value === "tasks"
                ? activeCount
                : t.value === "milestones"
                  ? milestones.length
                  : t.value === "activity"
                    ? activity.length
                    : t.value === "done"
                      ? doneCount
                      : t.value === "cancelled"
                        ? cancelledCount
                        : undefined;
            return (
              <TabsTrigger key={t.value} value={t.value}>
                <Icon className="h-4 w-4" />
                {t.label}
                {count !== undefined && count > 0 && (
                  <span className="bg-muted text-muted-foreground ml-0.5 rounded-full px-1.5 text-[11px]">
                    {count}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>

      <TabsContent value="tasks" className="mt-4">
        <div className="bg-card overflow-hidden rounded-xl border">
          {tasksPanel}
        </div>
      </TabsContent>

      <TabsContent value="gantt" className="mt-4">
        <Section title="甘特圖">
          <ProjectGantt tasks={tasks} color={color} goals={milestones} />
        </Section>
      </TabsContent>

      {doneCount > 0 && (
        <TabsContent value="done" className="mt-4">
          <Section title="已完成任務">
            <TaskListPanel tasks={tasks} variant="done" canEdit={canEdit} />
          </Section>
        </TabsContent>
      )}

      {cancelledCount > 0 && (
        <TabsContent value="cancelled" className="mt-4">
          <Section title="已取消任務">
            <TaskListPanel tasks={tasks} variant="cancelled" canEdit={canEdit} />
          </Section>
        </TabsContent>
      )}

      <TabsContent value="milestones" className="mt-4">
        <Section title="里程碑 / 目標">
          <MilestonesPanel
            projectId={projectId}
            milestones={milestones}
            canEdit={canEdit}
          />
        </Section>
      </TabsContent>

      <TabsContent value="activity" className="mt-4">
        <Section title="軌跡 · 狀態歷程">
          <ActivityTimeline items={activity} />
        </Section>
      </TabsContent>

      {settings && (
        <TabsContent value="settings" className="mt-4">
          <div className="bg-card rounded-xl border p-4 sm:p-5">{settings}</div>
        </TabsContent>
      )}
    </Tabs>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-xl border p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}
