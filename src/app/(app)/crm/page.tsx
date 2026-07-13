import Link from "next/link";
import { Plus, TrendingUp, Wallet, Trophy, Target } from "lucide-react";
import { requireActiveOrg } from "@/server/org";
import {
  getCrmDeals,
  getCrmContacts,
  getDealStages,
  getOrgMemberUsers,
} from "@/server/queries";
import { fmtMoney } from "@/lib/crm";
import { primaryName } from "@/lib/display";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DealDialog } from "@/components/crm/deal-dialog";
import { ContactDialog } from "@/components/crm/contact-dialog";
import {
  PipelineBoard,
  type DealView,
  type ContactLite,
  type StageView,
} from "@/components/crm/pipeline-board";
import { ContactsList, type ContactRow } from "@/components/crm/contacts-list";

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
  const tab = tabParam === "contacts" ? "contacts" : "pipeline";

  const [dealRows, contactRows, members, stageRows] = await Promise.all([
    getCrmDeals(org.id),
    getCrmContacts(org.id),
    getOrgMemberUsers(org.id),
    getDealStages(org.id),
  ]);

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
    <div className="space-y-4">
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
        <TabLink href="/crm?tab=contacts" active={tab === "contacts"}>
          聯絡人 · {contactRows.length}
        </TabLink>
      </div>

      {tab === "pipeline" ? (
        <PipelineBoard
          deals={openDeals}
          members={members}
          contacts={contacts}
          stages={stages}
        />
      ) : (
        <ContactsList contacts={contactRowsView} members={members} />
      )}
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
