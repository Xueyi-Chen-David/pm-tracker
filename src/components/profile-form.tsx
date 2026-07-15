"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateProfileAction } from "@/server/actions/team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export type ProfileValues = {
  id: string; // user id
  membershipId: string; // 該成員的 membership id（用來排除自己出主管選單）
  name: string | null;
  nickname: string | null;
  useNickname: boolean;
  email: string | null;
  jobTitle: string | null;
  department: string | null;
  attendance: string | null;
  bio: string | null;
  isBoss: boolean;
  active: boolean;
  allowedModules: string[];
  trackAttendance: boolean;
  managerId: string | null; // 目前上級主管的 membership id
  roleIds: string[]; // 目前指派的自訂角色 id
};

export type MemberOption = { membershipId: string; label: string };

export type RoleOption = {
  id: string;
  name: string;
  color: string | null;
};

/**
 * 成員 profile 編輯表單（僅管理者可見／可用）。
 * 「在職啟用 / 出席追蹤 / 上級主管」等為管理設定。
 */
export function ProfileForm({
  values,
  memberOptions,
  roleOptions = [],
  departments = [],
}: {
  values: ProfileValues;
  memberOptions: MemberOption[];
  roleOptions?: RoleOption[];
  departments?: string[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // 主管選單：排除自己。
  const supervisorChoices = memberOptions.filter(
    (o) => o.membershipId !== values.membershipId,
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await updateProfileAction(null, fd);
      if (res?.ok) {
        toast.success("已儲存 profile");
        router.refresh();
      } else {
        setError(res?.error ?? "儲存失敗");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="id" value={values.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="p-name">真實姓名</Label>
          <Input id="p-name" name="name" defaultValue={values.name ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-nickname">綽號</Label>
          <Input
            id="p-nickname"
            name="nickname"
            defaultValue={values.nickname ?? ""}
            placeholder="暱稱 / 顯示名稱"
          />
        </div>
      </div>

      <label className="bg-muted/40 flex items-center gap-2 rounded-md px-3 py-2 text-sm">
        <input
          type="checkbox"
          name="useNickname"
          defaultChecked={values.useNickname}
          className="accent-primary h-4 w-4"
        />
        全站顯示時用<strong className="font-semibold">綽號</strong>取代真實姓名
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="p-job">職稱</Label>
          <Input
            id="p-job"
            name="jobTitle"
            defaultValue={values.jobTitle ?? ""}
            placeholder="例：業務 / 工程 / PM"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-dept">部門</Label>
          <Input
            id="p-dept"
            name="department"
            list="profile-departments"
            defaultValue={values.department ?? ""}
            placeholder="例：業務部 / 研發部"
          />
          <datalist id="profile-departments">
            {departments.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="p-email">Email（登入身分）</Label>
        <Input
          id="p-email"
          name="email"
          type="email"
          defaultValue={values.email ?? ""}
          placeholder="name@example.com"
        />
        <p className="text-muted-foreground text-xs">
          這是該成員用來登入的 Email；修改後需用新 Email 登入。
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="p-attendance">出席情況</Label>
        <Input
          id="p-attendance"
          name="attendance"
          defaultValue={values.attendance ?? ""}
          placeholder="例：全職在職 / 每週二三出席 / 遠端"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="p-bio">簡介 / 備註</Label>
        <Textarea
          id="p-bio"
          name="bio"
          rows={2}
          defaultValue={values.bio ?? ""}
        />
      </div>

      {/* 組織架構：上級主管 */}
      <div className="space-y-1.5">
        <Label htmlFor="p-manager">上級主管</Label>
        <select
          id="p-manager"
          name="managerId"
          defaultValue={values.managerId ?? ""}
          className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          <option value="">（無上級主管）</option>
          {supervisorChoices.map((o) => (
            <option key={o.membershipId} value={o.membershipId}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">
          設定後，該主管可在「每日報告」看到此成員的日報並回饋。
        </p>
      </div>

      {/* 人資：指派自訂角色（權限）。可多選；管理者天生擁有全部權限、不需指派。 */}
      <div className="space-y-1.5">
        <Label>角色 / 權限</Label>
        {roleOptions.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            尚未建立任何角色。到「團隊 → 角色權限」新增角色（如 人資、會計）後即可在此指派。
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {roleOptions.map((r) => (
              <label
                key={r.id}
                className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm"
              >
                <input
                  type="checkbox"
                  name="roleId"
                  value={r.id}
                  defaultChecked={values.roleIds.includes(r.id)}
                  className="accent-primary h-3.5 w-3.5"
                />
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: r.color ?? "#64748b" }}
                />
                {r.name}
              </label>
            ))}
          </div>
        )}
        <p className="text-muted-foreground text-xs">
          指派角色即授予該角色的權限（例如「人資」可查看全體出勤、管理請假與薪資）。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={values.active}
            className="accent-emerald-600 h-4 w-4"
          />
          在職 / 啟用
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="trackAttendance"
            defaultChecked={values.trackAttendance}
            className="accent-primary h-4 w-4"
          />
          納入出席追蹤（顯示於出席月曆）
        </label>
      </div>

      {error && (
        <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "儲存中…" : "儲存 profile"}
        </Button>
      </div>
    </form>
  );
}
