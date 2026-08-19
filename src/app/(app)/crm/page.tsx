import Link from "next/link";
import { Plus, TrendingUp, Wallet, Trophy, Target } from "lucide-react";
import { requireActiveOrg } from "@/server/org";
import {
  getCrmDeals,
  getCrmContacts,
  getDealStages,
  getCrmEvents,
  getCrmFollowUps,
  getCrmActivityLog,
  getCrmCompanies,
  getCrmCompanyProfiles,
  getOrgMemberUsers,
} from "@/server/queries";
import { fmtMoney, effectiveProbability } from "@/lib/crm";
import { isAiEnabled } from "@/server/gemini";
import { primaryName } from "@/lib/display";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DealDialog } from "@/components/crm/deal-dialog";
import { ContactDialog } from "@/components/crm/contact-dialog";
import { EventsSection } from "@/components/crm/events-section";
import {
  PipelineBoard,
  type DealView,
  type ContactLite,
  type StageView,
} from "@/components/crm/pipeline-board";
import { type ContactRow } from "@/components/crm/contacts-list";
import { ContactsSection } from "@/components/crm/contacts-section";
import { FunnelView, type FunnelStage } from "@/components/crm/funnel-view";
import { FollowUpsList } from "@/components/crm/followups-list";
import { ActivityLogList } from "@/components/crm/activity-log-list";
import { AddCompanyDialog } from "@/components/crm/company-profile-card";
import { CompanyStatsPanel } from "@/components/crm/company-stats-panel";
import type { EventView, FollowUpView, ActivityLogView } from "@/components/crm/types";

export const metadata = { title: "CRM · Project Pulse" };

function ymd(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { org } = await requireActiveOrg();
  const aiEnabled = isAiEnabled();
  const { tab: tabParam } = await searchParams;
  const tab =
    tabParam === "contacts"
      ? "contacts"
      : tabParam === "funnel"
        ? "funnel"
        : tabParam === "events"
          ? "events"
          : tabParam === "followups"
            ? "followups"
            : tabParam === "activityLog"
              ? "activityLog"
              : tabParam === "companyStats"
                ? "companyStats"
                : "pipeline";

  const [
    dealRows,
    contactRows,
    members,
    stageRows,
    eventRows,
    followUpRows,
    activityLogRows,
    companies,
    companyProfiles,
  ] = await Promise.all([
    getCrmDeals(org.id),
    getCrmContacts(org.id),
    getOrgMemberUsers(org.id),
    getDealStages(org.id),
    getCrmEvents(org.id),
    getCrmFollowUps(org.id),
    getCrmActivityLog(org.id),
    getCrmCompanies(org.id),
    getCrmCompanyProfiles(org.id),
  ]);

  const events: EventView[] = eventRows.map((e) => ({
    id: e.id,
    date: e.date.toISOString().slice(0, 10),
    type: e.type,
    title: e.title,
    notes: e.notes,
    link: e.link,
    contact: e.contact
      ? { id: e.contact.id, name: e.contact.name, company: e.contact.company }
      : null,
  }));

  const stages: StageView[] = stageRows.map((s) => ({
    id: s.id,
    key: s.key,
    label: s.label,
    note: s.note,
    color: s.color,
    defaultProbability: s.defaultProbability,
  }));
  const stageByKey = new Map(stages.map((s) => [s.key, s]));

  const deals: DealView[] = dealRows.map((d) => ({
    id: d.id,
    title: d.title,
    value: d.value,
    stage: d.stage,
    status: d.status,
    contact: d.contact
      ? { id: d.contact.id, name: d.contact.name, company: d.contact.company }
      : null,
    owner: d.owner,
    expectedCloseDate: ymd(d.expectedCloseDate),
    probability: d.probability,
    closedReason: d.closedReason,
    note: d.note,
    activityCount: d._count.activities,
  }));

  const openDeals = deals.filter((d) => d.status === "OPEN");
  const won = deals.filter((d) => d.status === "WON");
  const lost = deals.filter((d) => d.status === "LOST");
  const weightedPipelineValue = openDeals.reduce((sum, d) => {
    const prob = effectiveProbability(
      d.probability,
      stageByKey.get(d.stage)?.defaultProbability,
    );
    return sum + Math.round((d.value * prob) / 100);
  }, 0);

  const followUps: FollowUpView[] = followUpRows.map((f) => ({
    id: f.id,
    body: f.body,
    dueDate: ymd(f.dueDate),
    deal: {
      id: f.deal.id,
      title: f.deal.title,
      contact: f.deal.contact
        ? {
            id: f.deal.contact.id,
            name: f.deal.contact.name,
            company: f.deal.contact.company,
          }
        : null,
    },
  }));

  const activityLogs: ActivityLogView[] = activityLogRows.map((a) => ({
    id: a.id,
    type: a.type,
    body: a.body,
    dueDate: ymd(a.dueDate),
    done: a.done,
    createdAt: a.createdAt.toISOString(),
    author: a.author,
    deal: {
      id: a.deal.id,
      title: a.deal.title,
      contact: a.deal.contact
        ? {
            id: a.deal.contact.id,
            name: a.deal.contact.name,
            company: a.deal.contact.company,
          }
        : null,
    },
  }));

  // 漏斗：依階段順序統計所有商機的數量與金額。
  const funnelStages: FunnelStage[] = stages.map((s) => {
    const ds = deals.filter((d) => d.stage === s.key);
    return {
      key: s.key,
      label: s.label,
      color: s.color,
      count: ds.length,
      value: ds.reduce((a, d) => a + d.value, 0),
    };
  });
  const pipelineValue = openDeals.reduce((s, d) => s + d.value, 0);
  const wonValue = won.reduce((s, d) => s + d.value, 0);
  const closed = won.length + lost.length;
  const winRate = closed > 0 ? Math.round((won.length / closed) * 100) : 0;

  const contacts: ContactLite[] = contactRows.map((c) => ({
    id: c.id,
    name: c.name,
    company: c.company,
  }));

  const contactRowsView: ContactRow[] = contactRows.map((c) => ({
    id: c.id,
    name: c.name,
    company: c.company,
    title: c.title,
    email: c.email,
    phone: c.phone,
    note: c.note,
    ownerId: c.ownerId,
    ownerName: c.owner ? primaryName(c.owner) : null,
    dealCount: c._count.deals,
  }));

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="CRM"
        description={`銷售管線 · ${openDeals.length} 個進行中商機 · ${contactRows.length} 位聯絡人`}
      >
        <AddCompanyDialog
          trigger={
            <Button variant="outline" className="gap-1.5">
              <Plus className="h-4 w-4" /> 新增公司
            </Button>
          }
        />
        <ContactDialog
          members={members}
          aiEnabled={aiEnabled}
          trigger={
            <Button variant="outline" className="gap-1.5">
              <Plus className="h-4 w-4" /> 新增聯絡人
            </Button>
          }
        />
        <DealDialog
          members={members}
          contacts={contacts}
          stages={stages}
          trigger={
            <Button className="gap-1.5">
              <Plus className="h-4 w-4" /> 新增商機
            </Button>
          }
        />
      </PageHeader>

      {/* 摘要：矮視窗（筆電）容易被這一列擠壓到看板可用高度，故盡量壓扁——單行、
          value/label 同排、icon 縮小；sm 以上就固定 4 欄，不讓它疊成兩行佔更多高度。 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          icon={<TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-5 lg:w-5" />}
          label="進行中商機"
          value={openDeals.length}
          tone="sky"
        />
        <StatTile
          icon={<Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-5 lg:w-5" />}
          label="管線金額"
          value={fmtMoney(pipelineValue)}
          sub={`加權 ${fmtMoney(weightedPipelineValue)}`}
          tone="violet"
        />
        <StatTile
          icon={<Trophy className="h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-5 lg:w-5" />}
          label="已成交"
          value={won.length}
          sub={fmtMoney(wonValue)}
          tone="emerald"
        />
        <StatTile
          icon={<Target className="h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-5 lg:w-5" />}
          label="成交率"
          value={`${winRate}%`}
          sub={`${won.length} 勝 / ${lost.length} 敗`}
          tone="amber"
        />
      </div>

      {/* 分頁 */}
      <div className="flex items-center gap-1 border-b">
        <TabLink href="/crm?tab=followups" active={tab === "followups"}>
          待跟進 · {followUps.length}
        </TabLink>
        <TabLink href="/crm?tab=pipeline" active={tab === "pipeline"}>
          銷售管線 · {openDeals.length}
        </TabLink>
        <TabLink href="/crm?tab=funnel" active={tab === "funnel"}>
          漏斗
        </TabLink>
        <TabLink href="/crm?tab=activityLog" active={tab === "activityLog"}>
          跟進紀錄 · {activityLogs.length}
        </TabLink>
        <TabLink href="/crm?tab=events" active={tab === "events"}>
          活動 · {events.length}
        </TabLink>
        <TabLink href="/crm?tab=contacts" active={tab === "contacts"}>
          聯絡人 · {contactRows.length}
        </TabLink>
        <TabLink href="/crm?tab=companyStats" active={tab === "companyStats"}>
          統計 · {companyProfiles.length}
        </TabLink>
      </div>

      <div className="min-h-0 flex-1">
        {tab === "followups" ? (
          <div className="h-full overflow-y-auto pb-2">
            <FollowUpsList
              followUps={followUps}
              deals={deals}
              members={members}
              contacts={contacts}
              stages={stages}
            />
          </div>
        ) : tab === "pipeline" ? (
          <PipelineBoard
            deals={openDeals}
            members={members}
            contacts={contacts}
            stages={stages}
          />
        ) : tab === "funnel" ? (
          <div className="h-full overflow-y-auto pb-2">
            <FunnelView stages={funnelStages} />
          </div>
        ) : tab === "activityLog" ? (
          <div className="h-full overflow-y-auto pb-2">
            <ActivityLogList
              logs={activityLogs}
              deals={deals}
              members={members}
              contacts={contacts}
              stages={stages}
            />
          </div>
        ) : tab === "events" ? (
          <div className="h-full overflow-y-auto pb-2">
            <EventsSection events={events} contacts={contacts} />
          </div>
        ) : tab === "companyStats" ? (
          <div className="h-full overflow-y-auto pb-2">
            <CompanyStatsPanel profiles={companyProfiles} />
          </div>
        ) : (
          <div className="h-full overflow-y-auto pb-2">
            <ContactsSection
              contacts={contactRowsView}
              companies={companies}
              companyProfiles={companyProfiles}
              members={members}
              aiEnabled={aiEnabled}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const TONE: Record<string, string> = {
  sky: "bg-sky-100 text-sky-600",
  violet: "bg-violet-100 text-violet-600",
  emerald: "bg-emerald-100 text-emerald-600",
  amber: "bg-amber-100 text-amber-600",
};

function StatTile({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone: keyof typeof TONE;
}) {
  return (
    // 窄視窗（筆電）維持壓扁——這排卡片不能擠掉看板的可用高度；寬視窗有空間就沒必要
    // 一樣扁，跟著 sm/lg 斷點放大。value 跟 label 同一行（不再上下疊兩行）在所有尺寸
    // 都保留，省下的高度比字級大小更值得。sub（加權金額／勝敗）縮到最小字級。
    <Card size="sm" className="py-1.5 sm:py-2 lg:py-3">
      <CardContent className="flex items-center gap-2 px-2.5 sm:gap-2.5 sm:px-3 lg:gap-3 lg:px-3.5">
        <div
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md sm:h-8 sm:w-8 lg:h-9 lg:w-9",
            TONE[tone],
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm leading-none font-bold tabular-nums sm:text-base lg:text-lg">
              {value}
            </span>
            <span className="text-muted-foreground truncate text-[11px] leading-none sm:text-xs lg:text-sm">
              {label}
            </span>
          </div>
          {sub && (
            <div className="text-muted-foreground/80 mt-0.5 truncate text-[10px] leading-none sm:text-[11px] lg:text-xs">
              {sub}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "text-muted-foreground hover:text-foreground border-transparent",
      )}
    >
      {children}
    </Link>
  );
}
