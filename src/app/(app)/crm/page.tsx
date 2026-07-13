import Link from "next/link";
import {
  Plus,
  TrendingUp,
  Wallet,
  Trophy,
  Target,
  Pencil,
  CalendarDays,
  Link2,
} from "lucide-react";
import { requireActiveOrg } from "@/server/org";
import {
  getCrmDeals,
  getCrmContacts,
  getDealStages,
  getCrmEvents,
  getOrgMemberUsers,
} from "@/server/queries";
import { fmtMoney } from "@/lib/crm";
import { fmtDate } from "@/lib/date";
import { primaryName } from "@/lib/display";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DealDialog } from "@/components/crm/deal-dialog";
import { ContactDialog } from "@/components/crm/contact-dialog";
import { CrmEventDialog } from "@/components/crm/event-dialog";
import {
  PipelineBoard,
  type DealView,
  type ContactLite,
  type StageView,
} from "@/components/crm/pipeline-board";
import { ContactsList, type ContactRow } from "@/components/crm/contacts-list";
import { FunnelView, type FunnelStage } from "@/components/crm/funnel-view";
import type { EventView } from "@/components/crm/types";

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
  const { tab: tabParam } = await searchParams;
  const tab =
    tabParam === "contacts"
      ? "contacts"
      : tabParam === "funnel"
        ? "funnel"
        : tabParam === "events"
          ? "events"
          : "pipeline";

  const [dealRows, contactRows, members, stageRows, eventRows] =
    await Promise.all([
      getCrmDeals(org.id),
      getCrmContacts(org.id),
      getOrgMemberUsers(org.id),
      getDealStages(org.id),
      getCrmEvents(org.id),
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
  }));

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
    note: d.note,
    activityCount: d._count.activities,
  }));

  const openDeals = deals.filter((d) => d.status === "OPEN");
  const won = deals.filter((d) => d.status === "WON");
  const lost = deals.filter((d) => d.status === "LOST");

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
        <ContactDialog
          members={members}
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

      {/* 摘要 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<TrendingUp className="h-5 w-5" />}
          label="進行中商機"
          value={openDeals.length}
          tone="sky"
        />
        <StatTile
          icon={<Wallet className="h-5 w-5" />}
          label="管線金額"
          value={fmtMoney(pipelineValue)}
          tone="violet"
        />
        <StatTile
          icon={<Trophy className="h-5 w-5" />}
          label="已成交"
          value={won.length}
          sub={fmtMoney(wonValue)}
          tone="emerald"
        />
        <StatTile
          icon={<Target className="h-5 w-5" />}
          label="成交率"
          value={`${winRate}%`}
          sub={`${won.length} 勝 / ${lost.length} 敗`}
          tone="amber"
        />
      </div>

      {/* 分頁 */}
      <div className="flex items-center gap-1 border-b">
        <TabLink href="/crm?tab=pipeline" active={tab === "pipeline"}>
          銷售管線
        </TabLink>
        <TabLink href="/crm?tab=funnel" active={tab === "funnel"}>
          漏斗
        </TabLink>
        <TabLink href="/crm?tab=events" active={tab === "events"}>
          活動 · {events.length}
        </TabLink>
        <TabLink href="/crm?tab=contacts" active={tab === "contacts"}>
          聯絡人 · {contactRows.length}
        </TabLink>
      </div>

      <div className="min-h-0 flex-1">
        {tab === "pipeline" ? (
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
        ) : tab === "events" ? (
          <div className="h-full overflow-y-auto pb-2">
            <EventsList events={events} contacts={contacts} />
          </div>
        ) : (
          <div className="h-full overflow-y-auto pb-2">
            <ContactsList contacts={contactRowsView} members={members} />
          </div>
        )}
      </div>
    </div>
  );
}

/** CRM 活動紀錄清單（類似會議記錄）。 */
function EventsList({
  events,
  contacts,
}: {
  events: EventView[];
  contacts: ContactLite[];
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <CrmEventDialog
          contacts={contacts}
          trigger={
            <Button className="gap-1.5">
              <Plus className="h-4 w-4" /> 新增活動
            </Button>
          }
        />
      </div>
      {events.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
          還沒有任何活動紀錄。點右上「新增活動」開始記錄拜訪 / 電話 / 活動。
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((e) => (
            <div key={e.id} className="bg-card rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="bg-muted rounded-full px-2 py-0.5 text-xs font-medium">
                      {e.type}
                    </span>
                    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {fmtDate(e.date)}
                    </span>
                    {e.contact && (
                      <span className="bg-primary/10 text-primary max-w-[16rem] truncate rounded-full px-2 py-0.5 text-xs font-medium">
                        {e.contact.company || e.contact.name}
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold break-words">{e.title}</h3>
                  {e.link &&
                    (safeLink(e.link) ? (
                      <a
                        href={safeLink(e.link)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={e.link}
                        className="text-primary mt-1 flex max-w-full items-center gap-1 text-xs hover:underline"
                      >
                        <Link2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="max-w-[20rem] min-w-0 truncate">
                          {shortLink(e.link)}
                        </span>
                      </a>
                    ) : (
                      <div className="text-muted-foreground mt-1 flex max-w-full items-center gap-1 text-xs">
                        <Link2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="max-w-[20rem] min-w-0 truncate">
                          {e.link}
                        </span>
                      </div>
                    ))}
                </div>
                <CrmEventDialog
                  event={e}
                  contacts={contacts}
                  trigger={
                    <Button variant="ghost" size="icon-sm" title="編輯">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  }
                />
              </div>
              {e.notes && (
                <div className="mt-2 border-t pt-2 text-sm break-words whitespace-pre-wrap">
                  {e.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 可點的安全連結：有 http(s) 直接用；像網域就補 https；否則回 null。 */
function safeLink(url: string): string | null {
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (/^[\w-]+(\.[\w-]+)+/.test(u)) return `https://${u}`;
  return null;
}

/** 精簡顯示（去 https:// 與 www.）。 */
function shortLink(url: string): string {
  return url.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
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
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            TONE[tone],
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="truncate text-xl leading-none font-bold tabular-nums">
            {value}
          </div>
          <div className="text-muted-foreground mt-1 text-xs">{label}</div>
          {sub && <div className="text-muted-foreground/80 text-[11px]">{sub}</div>}
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
