import { Building2, ArrowRight, LogOut } from "lucide-react";
import type { OrgRole } from "@prisma/client";
import { requireUser } from "@/server/auth-helpers";
import { getMyMemberships, canManageMembers } from "@/server/org";
import { signOut } from "@/server/auth";
import { setActiveOrgAction } from "@/server/actions/organizations";
import { CreateOrgForm } from "@/components/create-org-form";
import { RenameOrgDialog } from "@/components/rename-org-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata = { title: "選擇組織 · Project Pulse" };

const ROLE_LABEL: Record<OrgRole, string> = {
  OWNER: "擁有者",
  ADMIN: "管理員",
  MEMBER: "成員",
};

async function logoutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function OrgsPage() {
  const user = await requireUser();
  const memberships = await getMyMemberships(user.id);

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="bg-primary text-primary-foreground mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl text-xl font-bold">
            P
          </div>
          <h1 className="text-2xl font-bold tracking-tight">選擇組織</h1>
          <p className="text-muted-foreground mt-1 text-sm">{user.email}</p>
        </div>

        {memberships.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">你的組織</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {memberships.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <form
                    action={async () => {
                      "use server";
                      // 失敗（極罕見的競態：切換當下已被移除成員）就留在這頁，
                      // 這個表單沒有接錯誤 UI；成功時 action 內部會 redirect。
                      await setActiveOrgAction(m.organizationId);
                    }}
                    className="min-w-0 flex-1"
                  >
                    <button
                      type="submit"
                      className="group hover:bg-muted flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors"
                    >
                      <span className="bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-md">
                        <Building2 className="h-4.5 w-4.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {m.organization.name}
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          {ROLE_LABEL[m.role]}
                        </span>
                      </span>
                      <ArrowRight className="text-muted-foreground h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  </form>
                  {canManageMembers(m.role) && (
                    <RenameOrgDialog
                      orgId={m.organizationId}
                      currentName={m.organization.name}
                    />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="text-muted-foreground py-8 text-center text-sm">
              你尚未加入任何組織。
              <br />
              建立一個新組織，或請管理員用你的 Email
              <br />
              （{user.email}）把你加入。
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">建立新組織</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateOrgForm />
          </CardContent>
        </Card>

        <form action={logoutAction} className="text-center">
          <Button type="submit" variant="ghost" size="sm">
            <LogOut className="h-4 w-4" /> 登出
          </Button>
        </form>
      </div>
    </div>
  );
}
