"use client";

import { useState } from "react";
import { Flag, Users, SlidersHorizontal } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MilestonesPanel } from "@/components/milestones-panel";
import { MembersPanel } from "@/components/members-panel";

// 由各子面板反推 prop 型別，避免重複定義又保證一致。
type Milestones = React.ComponentProps<typeof MilestonesPanel>["milestones"];
type Members = React.ComponentProps<typeof MembersPanel>["members"];
type AllUsers = React.ComponentProps<typeof MembersPanel>["allUsers"];

export function ProjectDetailTabs({
  projectId,
  canEdit,
  milestones,
  team,
  settings,
}: {
  projectId: string;
  canEdit: boolean;
  milestones: Milestones;
  team: { ownerId: string | null; members: Members; allUsers: AllUsers };
  /** 選填「設定」分頁內容（就地展開管理時傳入專案設定表單）。 */
  settings?: React.ReactNode;
}) {
  const [tab, setTab] = useState(settings ? "settings" : "milestones");

  const TAB_META: { value: string; label: string; icon: typeof Flag }[] = [
    ...(settings
      ? [{ value: "settings", label: "設定", icon: SlidersHorizontal }]
      : []),
    { value: "milestones", label: "里程碑", icon: Flag },
    { value: "team", label: "團隊", icon: Users },
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
                : t.value === "team"
                  ? team.members.length
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

      <TabsContent value="milestones" className="mt-4">
        <Section title="里程碑 / 目標">
          <MilestonesPanel
            projectId={projectId}
            milestones={milestones}
            canEdit={canEdit}
          />
        </Section>
      </TabsContent>

      <TabsContent value="team" className="mt-4">
        <Section title="團隊成員">
          <MembersPanel
            projectId={projectId}
            ownerId={team.ownerId}
            members={team.members}
            allUsers={team.allUsers}
            canEdit={canEdit}
          />
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
