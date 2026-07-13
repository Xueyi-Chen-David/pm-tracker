import { CircleUser, ShieldCheck } from "lucide-react";
import type { OrgRole } from "@prisma/client";
import { requireActiveOrg } from "@/server/org";
import { db } from "@/server/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MyProfileForm } from "@/components/my-profile-form";

export const metadata = { title: "個人資料 · Project Pulse" };

const ROLE_LABEL: Record<OrgRole, string> = {
  OWNER: "擁有者",
  ADMIN: "管理員",
  MEMBER: "成員",
};

export default async function MyProfilePage() {
  const { user, org, membership } = await requireActiveOrg();

  const me = await db.user.findUnique({
    where: { id: user.id },
    select: { name: true, nickname: true, useNickname: true, email: true },
  });

  const isManager = membership.role === "OWNER" || membership.role === "ADMIN";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <PageHeader
        title="個人資料"
        description="編輯你的姓名、綽號、Email 與簡介。"
      />

      {/* 唯讀：組織內身分（由管理者設定） */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
          <span className="text-muted-foreground">
            組織：<span className="text-foreground font-medium">{org.name}</span>
          </span>
          <span className="text-muted-foreground inline-flex items-center gap-1">
            <ShieldCheck className="h-4 w-4" />
            角色：
            <span className="text-foreground font-medium">
              {ROLE_LABEL[membership.role]}
            </span>
            {isManager && (
              <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-700">
                管理者
              </span>
            )}
            {membership.isBoss && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                老闆
              </span>
            )}
          </span>
          {membership.jobTitle && (
            <span className="text-muted-foreground">
              職稱：
              <span className="text-foreground font-medium">
                {membership.jobTitle}
              </span>
            </span>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <CircleUser className="h-4 w-4" /> 我的資料
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MyProfileForm
            values={{
              name: me?.name ?? null,
              nickname: me?.nickname ?? null,
              useNickname: me?.useNickname ?? false,
              email: me?.email ?? null,
              bio: membership.bio ?? null,
            }}
          />
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        角色、權限、職稱、上級主管等由管理者在「團隊」頁設定。
      </p>
    </div>
  );
}
