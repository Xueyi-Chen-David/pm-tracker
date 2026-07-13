import { Plus } from "lucide-react";
import { requireActiveOrg } from "@/server/org";
import {
  getObjectivesByLevel,
  getOrgMemberUsers,
  getOrgVision,
  getProjectsLite,
} from "@/server/queries";
import {
  currentYear,
  currentCycle,
  cycleYear,
  cycleQuarter,
  quarterCycle,
  QUARTERS,
  QUARTER_MONTHS,
} from "@/lib/okr";
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

export default async function CompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ qy?: string }>;
}) {
  const { org } = await requireActiveOrg();
  const { qy: qyParam } = await searchParams;

  const thisYear = currentYear();
  const nextYear = String(Number(thisYear) + 1);

  const [vision, members, projects, annualRows, quarterRows] =
    await Promise.all([
      getOrgVision(org.id),
      getOrgMemberUsers(org.id),
      getProjectsLite(org.id),
      getObjectivesByLevel(org.id, "ANNUAL"),
      getObjectivesByLevel(org.id, "QUARTERLY"),
    ]);

  // 年度 OKR：依年份分組，目前年份即使尚無目標也顯示。
  const annualViews = annualRows.map(toView);
  const annualCycles = Array.from(new Set(annualViews.map((o) => o.cycle)));
  const years = Array.from(new Set([...annualCycles, thisYear])).sort();
  const annualByYear = new Map<string, ObjectiveView[]>();
  for (const y of years) annualByYear.set(y, []);
  for (const o of annualViews) {
    const arr = annualByYear.get(o.cycle);
    if (arr) arr.push(o);
    else annualByYear.set(o.cycle, [o]);
  }

  // 季度 OKR：先選年份，再看該年 Q1–Q4。可選年份＝有資料的年份 ∪ 今年 / 明年。
  const quarterViews = quarterRows.map(toView);
  const quarterYears = Array.from(
    new Set([...quarterViews.map((o) => cycleYear(o.cycle)), thisYear, nextYear]),
  ).sort();
  const selectedYear =
    qyParam && quarterYears.includes(qyParam) ? qyParam : thisYear;
  const quarterByQ = new Map<number, ObjectiveView[]>();
  for (const q of QUARTERS) quarterByQ.set(q, []);
  for (const o of quarterViews) {
    if (cycleYear(o.cycle) !== selectedYear) continue;
    const q = cycleQuarter(o.cycle);
    if (q) quarterByQ.get(q)?.push(o);
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
        currentYear={thisYear}
        members={members}
        projects={projects}
      />

      <QuarterlyOkrSection
        year={selectedYear}
        years={quarterYears}
        byQuarter={quarterByQ}
        members={members}
        projects={projects}
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

/**
 * 季度 OKR：先用右上的年份下拉選一個年份；不預先鋪出 Q1–Q4，
 * 而是由使用者按「新增季度目標」時自行挑一個季別（Q1–Q4）來建立。
 * 只顯示「已有目標」的季度；每季各自新增 / 檢視 Objective 與底下的 Key Result。
 */
function QuarterlyOkrSection({
  year,
  years,
  byQuarter,
  members,
  projects,
}: {
  year: string;
  years: string[];
  byQuarter: Map<number, ObjectiveView[]>;
  members: React.ComponentProps<typeof ObjectiveCard>["members"];
  projects: React.ComponentProps<typeof ObjectiveCard>["projects"];
}) {
  const yearCycles = QUARTERS.map((q) => quarterCycle(year, q));
  // 只顯示已建立（有目標）的季度；使用者主動新增才會出現新的季度。
  const usedQuarters = QUARTERS.filter((q) => (byQuarter.get(q)?.length ?? 0) > 0);
  const total = usedQuarters.reduce(
    (s, q) => s + (byQuarter.get(q)?.length ?? 0),
    0,
  );
  // 「新增季度目標」對話框預設帶入的季別：今年→本季，其他年→ Q1。
  const defaultCycle =
    year === currentYear() ? currentCycle() : quarterCycle(year, 1);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">季度 OKR</h2>
          <p className="text-muted-foreground text-xs">
            先選年份，再自行新增要規劃的季度 · {year} 年 {usedQuarters.length} 季 /{" "}
            {total} 個目標
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CompanyCycleSelect param="qy" active={year} options={years} />
          <ObjectiveDialog
            members={members}
            cycles={yearCycles}
            cycleOptions={yearCycles}
            defaultCycle={defaultCycle}
            level="QUARTERLY"
            trigger={
              <Button className="gap-1.5">
                <Plus className="h-4 w-4" /> 新增季度目標
              </Button>
            }
          />
        </div>
      </div>

      {usedQuarters.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm">
          {year} 年尚無季度目標。點右上「新增季度目標」，選一個季別（Q1–Q4）建立。
        </div>
      ) : (
        <div className="space-y-4">
          {usedQuarters.map((q) => {
            const cycle = quarterCycle(year, q);
            const objs = byQuarter.get(q) ?? [];
            return (
              <div key={q} className="space-y-2">
                <div className="flex items-center gap-2 border-b pb-1">
                  <h3 className="text-base font-semibold">Q{q}</h3>
                  <span className="text-muted-foreground text-xs">
                    {QUARTER_MONTHS[q]} · {objs.length} 個目標
                  </span>
                  <div className="ml-auto">
                    <ObjectiveDialog
                      members={members}
                      cycles={yearCycles}
                      cycleOptions={yearCycles}
                      defaultCycle={cycle}
                      level="QUARTERLY"
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

                <div className="space-y-3">
                  {objs.map((o, i) => (
                    <ObjectiveCard
                      key={o.id}
                      objective={o}
                      index={i}
                      members={members}
                      projects={projects}
                      cycles={yearCycles}
                      level="QUARTERLY"
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
