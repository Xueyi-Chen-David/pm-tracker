import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";
import { requireUser } from "@/server/auth-helpers";
import { getMyMemberships } from "@/server/org";
import { getMeetingById, getOrgMemberUsers } from "@/server/queries";
import { displayName } from "@/lib/display";
import { PageHeader } from "@/components/page-header";
import { MeetingCard } from "@/components/meeting-card";
import { CopyLinkButton } from "@/components/copy-link-button";

export const metadata = { title: "會議記錄 · Project Pulse" };

/**
 * 會議記錄的分享連結：不看「目前使用中的組織」，而是直接檢查這個登入者是不是「該會議
 * 所屬組織」的成員（掃過他所有組織的成員資格，不要求剛好是目前作用中的那個）——這樣才
 * 符合「有連結、登入過、是該公司成員就能看」的需求，而不是只有連結當下剛好切到那個組織
 * 的人才看得到。找不到會議、或不是該組織成員，一律 404（不區分兩者，避免讓人用連結去
 * 試探某個 id 是否存在）。
 */
export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const meeting = await getMeetingById(id);
  if (!meeting) notFound();

  const memberships = await getMyMemberships(user.id);
  const isMember = memberships.some((m) => m.organizationId === meeting.organizationId);
  if (!isMember) notFound();

  const members = await getOrgMemberUsers(meeting.organizationId);
  const nameById = new Map(members.map((m) => [m.id, displayName(m)]));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="會議記錄">
        <CopyLinkButton path={`/meetings/${meeting.id}`} />
      </PageHeader>
      <div className="text-muted-foreground mb-3 flex items-center gap-1 text-xs">
        <Building2 className="h-3.5 w-3.5" />
        {meeting.organization.name}
      </div>
      <MeetingCard meeting={meeting} nameById={nameById} memberCount={members.length} />
      <Link
        href="/meetings"
        className="text-muted-foreground mt-4 inline-flex items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        回到會議記錄列表
      </Link>
    </div>
  );
}
