"use client";

import Link from "next/link";
import { CheckCircle2, Circle, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDateShort } from "@/lib/date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { MemberProfile } from "@/server/queries";

type Tasks = MemberProfile["tasksOwned"];

export function AssignedTasksCard({ tasks }: { tasks: Tasks }) {
  const openTasks = tasks.filter((t) => t.status !== "DONE");
  const doneTasks = tasks.filter((t) => t.status === "DONE");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <ListChecks className="h-4 w-4" /> 被指派的任務
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {tasks.length === 0 ? (
          <p className="text-muted-foreground px-4 pb-4 text-sm">
            尚無被指派的任務
          </p>
        ) : (
          <Tabs defaultValue="open" className="px-4 pb-4">
            <TabsList variant="line" className="w-max">
              <TabsTrigger value="open">
                未完成
                {openTasks.length > 0 && (
                  <span className="bg-muted text-muted-foreground ml-0.5 rounded-full px-1.5 text-[11px]">
                    {openTasks.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="done">
                已完成
                {doneTasks.length > 0 && (
                  <span className="bg-muted text-muted-foreground ml-0.5 rounded-full px-1.5 text-[11px]">
                    {doneTasks.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="open" className="mt-2">
              <TaskList tasks={openTasks} emptyLabel="沒有未完成的任務" />
            </TabsContent>
            <TabsContent value="done" className="mt-2">
              <TaskList tasks={doneTasks} emptyLabel="尚無已完成的任務" />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function TaskList({ tasks, emptyLabel }: { tasks: Tasks; emptyLabel: string }) {
  if (tasks.length === 0) {
    return <p className="text-muted-foreground py-3 text-sm">{emptyLabel}</p>;
  }
  return (
    <div className="scroll-y max-h-64 divide-y overflow-y-auto">
      {tasks.map((t) => {
        const done = t.status === "DONE";
        return (
          <div key={t.id} className="flex items-center gap-2 py-2 text-sm">
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
  );
}
