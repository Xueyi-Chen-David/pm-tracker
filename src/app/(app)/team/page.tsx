import Link from "next/link";
import { Crown, FolderKanban, Users2, FileText } from "lucide-react";
import { requireManageContext } from "@/server/org";
import {
  getOrgMembers,
  getOrgMemberDirectory,
  getOrgRoles,
} from "@/server/queries";
import { RolesManager } from "@/components/roles-manager";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { AddMemberButton } from "@/components/add-member-button";
import { MemberDeleteButton } from "@/components/member-delete-button";
import { PaginatedMemberList } from "@/components/paginated-member-list";
import { ManagerRoleManager } from "@/components/manager-role-manager";
import { OrgStructureEditor } from "@/components/org-structure-editor";
import { ViewToggle } from "@/components/view-toggle";
import { MemberName } from "@/components/member-name";
import { LoginStatusBadge } from "@/components/login-status-badge";
import { WorkDescriptionEditor } from "@/components/work-description-editor";
import { displayName, displayInitial } from "@/lib/display";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";

export const metadata = { title: "團隊 · Project Pulse" };

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; tab?: string }>;
}) {
  const { org, user, canManage } = await requireManageContext();
  const { view: viewParam, tab: tabParam } = await searchParams;
  const view = viewParam === "card" ? "card" : "list";
  // 角色權限分頁僅管理者可見；非管理者強制回成員頁。
  let tab: "members" | "org" | "roles" = "members";
  if (tabParam === "org") tab = "org";
  else if (tabParam === "roles" && canManage) tab = "roles";

  const [members, directory, roles] = await Promise.all([
    getOrgMembers(org.id),
    getOrgMemberDirectory(org.id),
    canManage ? getOrgRoles(org.id) : Promise.resolve([]),
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
        {canManage && (
          <TabLink href="/team?tab=roles" active={tab === "roles"}>
            角色權限{roles.length > 0 ? ` · ${roles.length}` : ""}
          </TabLink>
        )}
      </div>

      {tab === "roles" ? (
        <RolesManager roles={roles} />
      ) : tab === "members" ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <ViewToggle view={view} basePath="/team" />
          </div>
          {view === "list" ? (
            <PaginatedMemberList
              members={members}
              canManage={canManage}
              viewerId={user.id}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {members.map((m) => (
                <Card
                  key={m.id}
                  className="hover:bg-muted/30 relative flex h-full flex-col gap-2 p-4 transition-colors"
                >
                  <Link
                    href={`/me/${m.id}`}
                    className="flex min-w-0 items-center gap-3"
                  >
                    <Avatar className="h-12 w-12" title={displayName(m)}>
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
                        <LoginStatusBadge loggedIn={m.hasLoggedIn} />
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
                  <div className="border-t pt-2">
                    <div className="text-muted-foreground mb-0.5 text-[11px] font-medium">
                      工作描述
                    </div>
                    <WorkDescriptionEditor
                      userId={m.id}
                      value={m.workDescription}
                      canEdit={canManage || m.id === user.id}
                      className="w-full"
                    />
                  </div>
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
