import { Plus } from "lucide-react";
import type { OkrLevel } from "@prisma/client";
import { requireActiveOrg } from "@/server/org";
import {
  getObjectives,
  getObjectivesByLevel,
  getOkrCycles,
  getOrgMemberUsers,
  getOrgVision,
  getProjectsLite,
} from "@/server/queries";
import { currentCycle } from "@/lib/okr";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { VisionEditor } from "@/components/company/vision-editor";
import { CompanyCycleSelect } from "@/components/company/company-cycle-select";
import { ObjectiveDialog } from "@/components/okr/objective-dialog";
import {
  ObjectiveCard,
  type ObjectiveView,
} from "@/components/okr/objective-card";

export const metadata = { title: "公司營運 · Project Pulse" };

function ymd(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

type ObjectiveRow = Awaited<ReturnType<typeof getObjectives>>[number];

function toView(o: ObjectiveRow): ObjectiveView {
  return {
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
  };
}

export default async function CompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { org } = await requireActiveOrg();
  const { q: qParam } = await searchParams;

  const currentYear = String(new Date().getFullYear());

  const [vision, members, projects, annualRows, quarterCycles] =
    await Promise.all([
      getOrgVision(org.id),
      getOrgMemberUsers(org.id),
      getProjectsLite(org.id),
      getObjectivesByLevel(org.id, "ANNUAL"), // 一次取回所有年份
      getOkrCycles(org.id, "QUARTERLY"),
    ]);

  const activeQuarter = qParam?.trim() || quarterCycles[0] || currentCycle();
  const quarterRows = await getObjectives(org.id, "QUARTERLY", activeQuarter);
  const quarterly = quarterRows.map(toView);

  // 年度 OKR：依年份分組，目前年份即使尚無目標也顯示。
  const annualViews = annualRows.map(toView);
  const annualCycles = Array.from(new Set(annualViews.map((o) => o.cycle)));
  const years = Array.from(new Set([...annualCycles, currentYear])).sort();
  const annualByYear = new Map<string, ObjectiveView[]>();
  for (const y of years) annualByYear.set(y, []);
  for (const o of annualViews) {
    const arr = annualByYear.get(o.cycle);
    if (arr) arr.push(o);
    else annualByYear.set(o.cycle, [o]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="公司營運"
        description="願景、年度 OKR、季度 OKR —— 策略層的目標。季度 KR 可連專案，進度自動反映。"
      />

      <VisionEditor vision={vision} />

      <AnnualOkrSection
        years={years}
        byYear={annualByYear}
        cycles={annualCycles}
        currentYear={currentYear}
        members={members}
        projects={projects}
      />

      <OkrSection
        level="QUARTERLY"
        heading="季度 OKR"
        subtitle="這一季的重點；KR 可連到專案即時反映進度"
        objectives={quarterly}
        members={members}
        projects={projects}
        cycles={quarterCycles}
        activeCycle={activeQuarter}
        selectParam="q"
        selectOptions={quarterCycles.length ? quarterCycles : [activeQuarter]}
      />
    </div>
  );
}

/** 年度 OKR：所有年份在同一個 section 一次看到，每個年份各自一組。 */
function AnnualOkrSection({
  years,
  byYear,
  cycles,
  currentYear,
  members,
  projects,
}: {
  years: string[];
  byYear: Map<string, ObjectiveView[]>;
  cycles: string[];
  currentYear: string;
  members: React.ComponentProps<typeof ObjectiveCard>["members"];
  projects: React.ComponentProps<typeof ObjectiveCard>["projects"];
}) {
  const total = years.reduce((s, y) => s + (byYear.get(y)?.length ?? 0), 0);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">年度 OKR</h2>
          <p className="text-muted-foreground text-xs">
            以整年為單位 · 共 {total} 個目標 · 每個年份各自的大目標
          </p>
        </div>
        <ObjectiveDialog
          members={members}
          cycles={cycles}
          defaultCycle={currentYear}
          level="ANNUAL"
          trigger={
            <Button className="gap-1.5">
              <Plus className="h-4 w-4" /> 新增年度目標
            </Button>
          }
        />
      </div>

      {years.map((year) => {
        const objs = byYear.get(year) ?? [];
        return (
          <div key={year} className="space-y-2">
            <div className="flex items-center gap-2 border-b pb-1">
              <h3 className="text-base font-semibold tabular-nums">{year}</h3>
              <span className="text-muted-foreground text-xs">
                年 · {objs.length} 個目標
              </span>
              <div className="ml-auto">
                <ObjectiveDialog
                  members={members}
                  cycles={cycles}
                  defaultCycle={year}
                  level="ANNUAL"
                  trigger={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                    >
                      <Plus className="h-3.5 w-3.5" /> 新增
                    </Button>
                  }
                />
              </div>
            </div>

            {objs.length === 0 ? (
              <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-center text-xs">
                {year} 年尚無年度目標。點右側「新增」建立。
              </p>
            ) : (
              <div className="space-y-3">
                {objs.map((o, i) => (
                  <ObjectiveCard
                    key={o.id}
                    objective={o}
                    index={i}
                    members={members}
                    projects={projects}
                    cycles={cycles}
                    level="ANNUAL"
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function OkrSection({
  level,
  heading,
  subtitle,
  objectives,
  members,
  projects,
  cycles,
  activeCycle,
  selectParam,
  selectOptions,
}: {
  level: OkrLevel;
  heading: string;
  subtitle: string;
  objectives: ObjectiveView[];
  members: React.ComponentProps<typeof ObjectiveCard>["members"];
  projects: React.ComponentProps<typeof ObjectiveCard>["projects"];
  cycles: string[];
  activeCycle: string;
  selectParam: "q";
  selectOptions: string[];
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{heading}</h2>
          <p className="text-muted-foreground text-xs">
            {activeCycle} · {objectives.length} 個目標 · {subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CompanyCycleSelect
            param={selectParam}
            active={activeCycle}
            options={selectOptions}
          />
          <ObjectiveDialog
            members={members}
            cycles={cycles}
            defaultCycle={activeCycle}
            level={level}
            trigger={
              <Button className="gap-1.5">
                <Plus className="h-4 w-4" /> 新增目標
              </Button>
            }
          />
        </div>
      </div>

      {objectives.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm">
          {activeCycle} 尚無{heading}。點右上「新增目標」開始。
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
              level={level}
            />
          ))}
        </div>
      )}
    </section>
  );
}
