"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateProfileAction } from "@/server/actions/team";
import { GATED_NORMAL_MODULES, GATED_ADMIN_MODULES } from "@/lib/modules";
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
};

export type MemberOption = { membershipId: string; label: string };

/**
 * 成員 profile 編輯表單（僅管理者可見／可用）。
 * 「設為老闆 / 在職啟用 / 出席追蹤 / 可見模組 / 上級主管」皆為管理設定。
 */
export function ProfileForm({
  values,
  memberOptions,
  departments = [],
}: {
  values: ProfileValues;
  memberOptions: MemberOption[];
  departments?: string[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // 細分權限拆兩塊：一般頁面（全部 / 白名單）＋ 管理者專屬頁的「額外授權」。
  const adminOnlyKeys = new Set<string>(GATED_ADMIN_MODULES.map((m) => m.key));
  const normalAllowed = values.allowedModules.filter(
    (k) => !adminOnlyKeys.has(k),
  );
  // 一般頁面：白名單為空＝可存取全部一般頁面。
  const [allAccess, setAllAccess] = useState(normalAllowed.length === 0);
  const [mods, setMods] = useState<Set<string>>(() => new Set(normalAllowed));
  // 管理者專屬頁：獨立授權集合。
  const [adminGrants, setAdminGrants] = useState<Set<string>>(
    () => new Set(values.allowedModules.filter((k) => adminOnlyKeys.has(k))),
  );
  function toggleMod(key: string, on: boolean) {
    setMods((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }
  function toggleAdminGrant(key: string, on: boolean) {
    setAdminGrants((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

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

      <div className="flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isBoss"
            defaultChecked={values.isBoss}
            className="accent-primary h-4 w-4"
          />
          設為老闆（週報「需決策」對象）
        </label>
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

      {/* 細分權限：一般可見頁面 */}
      <div className="space-y-2.5 rounded-lg border p-3">
        <div className="text-sm font-medium">可見一般頁面</div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="allModules"
            checked={allAccess}
            onChange={(e) => setAllAccess(e.currentTarget.checked)}
            className="accent-primary h-4 w-4"
          />
          可存取<strong className="font-semibold">全部</strong>一般頁面
        </label>
        {!allAccess && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1 sm:grid-cols-3">
            {GATED_NORMAL_MODULES.map((m) => (
              <label key={m.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={`mod_${m.key}`}
                  checked={mods.has(m.key)}
                  onChange={(e) => toggleMod(m.key, e.currentTarget.checked)}
                  className="accent-primary h-4 w-4"
                />
                {m.label}
              </label>
            ))}
          </div>
        )}
        <p className="text-muted-foreground text-xs">
          未勾「全部」時，此成員只看得到勾選的一般頁面。「每日報告 / 個人資料」一律可見。老闆一律可見全部。
        </p>
      </div>

      {/* 管理者專屬頁：額外授權（目前無此類頁面時不顯示） */}
      {GATED_ADMIN_MODULES.length > 0 && (
        <div className="space-y-2.5 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
          <div className="text-sm font-medium">管理頁面授權</div>
          <p className="text-muted-foreground text-xs">
            以下頁面預設只有<strong className="font-semibold">管理者 / 老闆</strong>看得到。勾選＝額外開放給此成員（不影響他其他頁面的可見性）。
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-0.5 sm:grid-cols-3">
            {GATED_ADMIN_MODULES.map((m) => (
              <label key={m.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={`mod_${m.key}`}
                  checked={adminGrants.has(m.key)}
                  onChange={(e) => toggleAdminGrant(m.key, e.currentTarget.checked)}
                  className="accent-primary h-4 w-4"
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>
      )}

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
