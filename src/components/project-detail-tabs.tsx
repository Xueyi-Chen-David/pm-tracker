"use client";

import { useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Flag,
  History,
  SlidersHorizontal,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MilestonesPanel } from "@/components/milestones-panel";
import {
  ActivityTimeline,
  type ActivityItem,
} from "@/components/projects/activity-timeline";
import { ProjectGantt } from "@/components/projects/project-gantt";
import { CompletedTasksPanel } from "@/components/projects/completed-tasks-panel";
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
  /** 選填「設定」分頁內容（就地展開管理時傳入專案設定表單）。 */
  settings?: React.ReactNode;
}) {
  const [tab, setTab] = useState(settings ? "settings" : "milestones");

  const doneCount = tasks.filter((t) => t.status === "DONE").length;

  const TAB_META: { value: string; label: string; icon: typeof Flag }[] = [
    ...(settings
      ? [{ value: "settings", label: "設定", icon: SlidersHorizontal }]
      : []),
    { value: "gantt", label: "甘特圖", icon: BarChart3 },
    // 有已完成任務時才顯示「已完成」分頁。
    ...(doneCount > 0
      ? [{ value: "done", label: "已完成", icon: CheckCircle2 }]
      : []),
    { value: "milestones", label: "里程碑", icon: Flag },
    { value: "activity", label: "軌跡", icon: History },
  ];

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
      <div className="overflow-x-auto">
        <TabsList variant="line" className="w-max">
          {TAB_META.map((t) => {
            const Icon = t.icon;
            const count =
              t.value === "milestones"
                ? milestones.length
                : t.value === "activity"
                  ? activity.length
                  : t.value === "done"
                    ? doneCount
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

      {settings && (
        <TabsContent value="settings" className="mt-4">
          <div className="bg-card rounded-xl border p-4 sm:p-5">{settings}</div>
        </TabsContent>
      )}

      <TabsContent value="gantt" className="mt-4">
        <Section title="甘特圖 · 任務時程">
          <ProjectGantt tasks={tasks} color={color} goals={milestones} />
        </Section>
      </TabsContent>

      {doneCount > 0 && (
        <TabsContent value="done" className="mt-4">
          <Section title="已完成任務">
            <CompletedTasksPanel tasks={tasks} />
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
