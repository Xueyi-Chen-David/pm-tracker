import { Plus } from "lucide-react";
import { requireActiveOrg } from "@/server/org";
import {
  getObjectives,
  getOkrCycles,
  getOrgMemberUsers,
  getProjectsLite,
} from "@/server/queries";
import { currentCycle } from "@/lib/okr";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { OkrCycleSelect } from "@/components/okr/okr-cycle-select";
import { ObjectiveDialog } from "@/components/okr/objective-dialog";
import {
  ObjectiveCard,
  type ObjectiveView,
} from "@/components/okr/objective-card";

export const metadata = { title: "OKR / 目標 · Project Pulse" };

function ymd(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export default async function OkrPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { org } = await requireActiveOrg();
  const { cycle: cycleParam } = await searchParams;

  const cycles = await getOkrCycles(org.id);
  const activeCycle = cycleParam?.trim() || cycles[0] || currentCycle();

  const [rows, members, projects] = await Promise.all([
    getObjectives(org.id, activeCycle),
    getOrgMemberUsers(org.id),
    getProjectsLite(org.id),
  ]);

  const objectives: ObjectiveView[] = rows.map((o) => ({
    id: o.id,
    title: o.title,
    description: o.description,
    cycle: o.cycle,
    targetDate: ymd(o.targetDate),
    owner: o.owner,
    keyResults: o.keyResults.map((k) => ({
      id: k.id,
      title: k.title,
      kind: k.kind,
      note: k.note,
      dueDate: ymd(k.dueDate),
      ownerLabel: k.ownerLabel,
      status: k.status,
      health: k.health,
      progress: k.progress,
      project: k.project,
      owners: k.owners,
    })),
  }));

  const totalKr = objectives.reduce((s, o) => s + o.keyResults.length, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="OKR / 目標"
        description={`${activeCycle} · ${objectives.length} 個目標 · ${totalKr} 項 Key Result`}
      >
        <OkrCycleSelect cycles={cycles} active={activeCycle} />
        <ObjectiveDialog
          members={members}
          cycles={cycles}
          defaultCycle={activeCycle}
          trigger={
            <Button className="gap-1.5">
              <Plus className="h-4 w-4" /> 新增目標
            </Button>
          }
        />
      </PageHeader>

      {objectives.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
          {activeCycle} 尚無目標。<br />
          點右上「新增目標」開始，KR 可連到「專案與任務」即時反映進度。
        </div>
      ) : (
        <div className="space-y-3">
          {objectives.map((o, i) => (
            <ObjectiveCard
              key={o.id}
              objective={o}
              index={i}
              members={members}
              projects={projects}
              cycles={cycles}
            />
          ))}
        </div>
      )}
    </div>
  );
}
