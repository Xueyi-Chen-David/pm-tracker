import Link from "next/link";
import { Crown, FolderKanban, Users2, FileText } from "lucide-react";
import { requireActiveOrg, canManageMembers } from "@/server/org";
import { getOrgMembers, getOrgMemberDirectory } from "@/server/queries";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { AddMemberButton } from "@/components/add-member-button";
import { MemberDeleteButton } from "@/components/member-delete-button";
import { PaginatedMemberList } from "@/components/paginated-member-list";
import { ManagerRoleManager } from "@/components/manager-role-manager";
import { OrgStructureEditor } from "@/components/org-structure-editor";
import { ViewToggle } from "@/components/view-toggle";
import { MemberName } from "@/components/member-name";
import { displayName, displayInitial } from "@/lib/display";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";

export const metadata = { title: "團隊 · Project Pulse" };

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; tab?: string }>;
}) {
  const { org, membership } = await requireActiveOrg();
  const canManage = canManageMembers(membership.role);
  const { view: viewParam, tab: tabParam } = await searchParams;
  const view = viewParam === "card" ? "card" : "list";
  const tab = tabParam === "org" ? "org" : "members";

  const [members, directory] = await Promise.all([
    getOrgMembers(org.id),
    getOrgMemberDirectory(org.id),
  ]);

  return (
    <div>
      <PageHeader
        title="團隊"
        description={`${members.length} 位成員 · 管理成員、部門與組織架構`}
      >
        {canManage && (
          <ManagerRoleManager
            members={directory.map((d) => ({
              id: d.id,
              name: d.name,
              nickname: d.nickname,
              useNickname: d.useNickname,
              email: d.email,
              role: d.role,
            }))}
          />
        )}
        {canManage && <AddMemberButton />}
      </PageHeader>

      {/* 分頁：成員 / 組織架構 */}
      <div className="mb-4 flex items-center gap-1 border-b">
        <TabLink href="/team?tab=members" active={tab === "members"}>
          成員 · {members.length}
        </TabLink>
        <TabLink href="/team?tab=org" active={tab === "org"}>
          組織架構
        </TabLink>
      </div>

      {tab === "members" ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <ViewToggle view={view} basePath="/team" />
          </div>
          {view === "list" ? (
            <PaginatedMemberList members={members} canManage={canManage} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {members.map((m) => (
                <Card
                  key={m.id}
                  className="hover:bg-muted/30 relative flex h-full flex-row items-center gap-3 p-4 transition-colors"
                >
                  <Link
                    href={`/team/${m.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <Avatar className="h-12 w-12">
                      {m.image && <AvatarImage src={m.image} alt="" />}
                      <AvatarFallback>{displayInitial(m)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <MemberName u={m} className="min-w-0 font-semibold" />
                        {m.isBoss && (
                          <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        )}
                        {!m.active && (
                          <span className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">
                            停用
                          </span>
                        )}
                      </div>
                      <div className="text-muted-foreground truncate text-xs">
                        {[m.department, m.jobTitle].filter(Boolean).join(" · ") ||
                          m.email}
                      </div>
                      <div className="text-muted-foreground mt-1.5 flex items-center gap-3 text-[11px]">
                        <span className="flex items-center gap-1">
                          <FolderKanban className="h-3 w-3" />
                          負責 {m._count.ownedProjects}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users2 className="h-3 w-3" />
                          參與 {m._count.memberships}
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          週報 {m._count.weeklyUpdates}
                        </span>
                      </div>
                    </div>
                  </Link>
                  {canManage && (
                    <div className="absolute top-2 right-2">
                      <MemberDeleteButton
                        id={m.id}
                        name={displayName(m)}
                        mode="icon"
                      />
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        <OrgStructureEditor members={directory} canManage={canManage} />
      )}
    </div>
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
