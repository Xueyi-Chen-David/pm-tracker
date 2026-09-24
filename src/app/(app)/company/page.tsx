import { ChevronRight, Plus } from "lucide-react";
import { requireActiveOrg } from "@/server/org";
import {
  getObjectivesByLevel,
  getOkrPeriods,
  getOrgMemberUsers,
  getOrgVision,
  getProjectsLite,
} from "@/server/queries";
import {
  currentYear,
  cycleYear,
  cycleQuarter,
  quarterCycle,
  QUARTER_MONTHS,
} from "@/lib/okr";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { VisionEditor } from "@/components/company/vision-editor";
import {
  AddOkrQuarterButton,
  AddOkrYearButton,
  DeleteOkrPeriodButton,
} from "@/components/company/okr-period-controls";
import { ObjectiveDialog } from "@/components/okr/objective-dialog";
import {
  ObjectiveCard,
  type ObjectiveView,
} from "@/components/okr/objective-card";

export const metadata = { title: "公司OKR · Project Pulse" };

function ymd(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

type ObjectiveRow = Awaited<ReturnType<typeof getObjectivesByLevel>>[number];

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

export default async function CompanyPage() {
  const { org } = await requireActiveOrg();
  const thisYear = currentYear();

  const [vision, members, projects, annualRows, quarterRows, periods] =
    await Promise.all([
      getOrgVision(org.id),
      getOrgMemberUsers(org.id),
      getProjectsLite(org.id),
      getObjectivesByLevel(org.id, "ANNUAL"),
      getObjectivesByLevel(org.id, "QUARTERLY"),
      getOkrPeriods(org.id),
    ]);

  const annualViews = annualRows.map(toView);
  const quarterViews = quarterRows.map(toView);

  // 年份＝使用者建立的年份 ∪ 既有目標用到的年份；新的在上面。今年不會自動出現，要自己新增。
  const years = Array.from(
    new Set([
      ...periods.map((p) => String(p.year)),
      ...annualViews.map((o) => cycleYear(o.cycle)),
      ...quarterViews.map((o) => cycleYear(o.cycle)),
    ]),
  )
    .filter((y) => /^\d{4}$/.test(y))
    .sort((a, b) => Number(b) - Number(a));

  // 每個年份底下的季度＝建立過的季度 ∪ 有目標的季度。
  const quartersByYear = new Map<string, Set<number>>();
  for (const y of years) quartersByYear.set(y, new Set());
  for (const p of periods) if (p.quarter > 0) quartersByYear.get(String(p.year))?.add(p.quarter);
  for (const o of quarterViews) {
    const q = cycleQuarter(o.cycle);
    if (q) quartersByYear.get(cycleYear(o.cycle))?.add(q);
  }

  const byCycle = new Map<string, ObjectiveView[]>();
  for (const o of [...annualViews, ...quarterViews]) {
    const arr = byCycle.get(o.cycle) ?? [];
    arr.push(o);
    byCycle.set(o.cycle, arr);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="公司OKR"
        description="願景與各年份的 OKR：先建年份，年份底下有年度目標與 Q1–Q4 季度目標。季度 KR 可連專案，進度自動反映。"
      />

      <VisionEditor vision={vision} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">OKR</h2>
            <p className="text-muted-foreground text-xs">
              共 {years.length} 個年份 · {annualViews.length} 個年度目標 · {quarterViews.length} 個季度目標
            </p>
          </div>
          <AddOkrYearButton
            suggested={years.length ? Math.max(...years.map(Number)) + 1 : Number(thisYear)}
          />
        </div>

        {years.length === 0 && (
          <div className="text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm">
            還沒有任何年份。按右上「新增年份」開始規劃。
          </div>
        )}
        {years.map((year) => (
          <YearBlock
            key={year}
            year={year}
            isOpen={Number(year) >= Number(thisYear)}
            allYears={years}
            quarters={Array.from(quartersByYear.get(year) ?? []).sort()}
            byCycle={byCycle}
            members={members}
            projects={projects}
          />
        ))}
      </section>
    </div>
  );
}

type Members = React.ComponentProps<typeof ObjectiveCard>["members"];
type Projects = React.ComponentProps<typeof ObjectiveCard>["projects"];

/** 一個年份：年度目標 + 該年的季度（Q1–Q4，使用者自行新增）。今年以後預設展開。 */
function YearBlock({
  year,
  isOpen,
  allYears,
  quarters,
  byCycle,
  members,
  projects,
}: {
  year: string;
  isOpen: boolean;
  allYears: string[];
  quarters: number[];
  byCycle: Map<string, ObjectiveView[]>;
  members: Members;
  projects: Projects;
}) {
  const annual = byCycle.get(year) ?? [];
  const quarterCycles = quarters.map((q) => quarterCycle(year, q));
  const quarterCount = quarterCycles.reduce((s, c) => s + (byCycle.get(c)?.length ?? 0), 0);

  return (
    <details open={isOpen} className="group bg-card rounded-xl border">
      <summary className="hover:bg-muted/40 flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3">
        <ChevronRight className="text-muted-foreground h-4 w-4 transition-transform group-open:rotate-90" />
        <span className="text-base font-semibold tabular-nums">{year} 年</span>
        <span className="text-muted-foreground text-xs">
          年度目標 {annual.length} · {quarters.length} 季 · 季度目標 {quarterCount}
        </span>
      </summary>

      <div className="space-y-5 border-t px-4 py-4">
        {/* 年度目標 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">年度目標</h3>
            <div className="ml-auto flex items-center gap-1">
              <ObjectiveDialog
                members={members}
                cycles={allYears}
                cycleOptions={[year]}
                defaultCycle={year}
                level="ANNUAL"
                trigger={
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                    <Plus className="h-3.5 w-3.5" /> 新增年度目標
                  </Button>
                }
              />
            </div>
          </div>
          {annual.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-3 text-center text-xs">
              {year} 年還沒有年度目標。
            </p>
          ) : (
            <div className="space-y-3">
              {annual.map((o, i) => (
                <ObjectiveCard
                  key={o.id}
                  objective={o}
                  index={i}
                  members={members}
                  projects={projects}
                  cycles={allYears}
                  level="ANNUAL"
                />
              ))}
            </div>
          )}
        </div>

        {/* 季度 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">季度</h3>
            <div className="ml-auto">
              <AddOkrQuarterButton year={Number(year)} existing={quarters} />
            </div>
          </div>
          {quarters.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-3 text-center text-xs">
              還沒有季度。按「新增季度」選 Q1–Q4。
            </p>
          ) : (
            quarters.map((q) => {
              const cycle = quarterCycle(year, q);
              const objs = byCycle.get(cycle) ?? [];
              return (
                <div key={q} className="bg-muted/20 space-y-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Q{q}</span>
                    <span className="text-muted-foreground text-xs">
                      {QUARTER_MONTHS[q]} · {objs.length} 個目標
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      <ObjectiveDialog
                        members={members}
                        cycles={quarterCycles}
                        cycleOptions={quarterCycles}
                        defaultCycle={cycle}
                        level="QUARTERLY"
                        trigger={
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                            <Plus className="h-3.5 w-3.5" /> 新增目標
                          </Button>
                        }
                      />
                      <DeleteOkrPeriodButton year={Number(year)} quarter={q} label={`${year} Q${q}`} />
                    </div>
                  </div>
                  {objs.length === 0 ? (
                    <p className="text-muted-foreground py-1 text-xs">這一季還沒有目標。</p>
                  ) : (
                    <div className="space-y-3">
                      {objs.map((o, i) => (
                        <ObjectiveCard
                          key={o.id}
                          objective={o}
                          index={i}
                          members={members}
                          projects={projects}
                          cycles={quarterCycles}
                          level="QUARTERLY"
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="flex justify-end border-t pt-3">
          <DeleteOkrPeriodButton year={Number(year)} quarter={0} label={`${year} 年`} withText />
        </div>
      </div>
    </details>
  );
}
