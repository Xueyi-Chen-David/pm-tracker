"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateProfileAction } from "@/server/actions/team";
import { MODULES } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export type ProfileValues = {
  id: string;
  name: string | null;
  nickname: string | null;
  useNickname: boolean;
  email: string | null;
  jobTitle: string | null;
  attendance: string | null;
  persona: string | null;
  personality: string | null;
  bio: string | null;
  productivityNote: string | null;
  isBoss: boolean;
  active: boolean;
  allowedModules: string[];
  trackAttendance: boolean;
};

export function ProfileForm({ values }: { values: ProfileValues }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // 細分權限：空陣列＝可存取全部模組。
  const [allAccess, setAllAccess] = useState(values.allowedModules.length === 0);
  const [mods, setMods] = useState<Set<string>>(
    () => new Set(values.allowedModules),
  );
  function toggleMod(key: string, on: boolean) {
    setMods((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

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
    <form onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="id" value={values.id} />

      {/* ── 基本資料 ── */}
      <section className="space-y-3">
        <SectionLabel>基本資料</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="真實姓名" htmlFor="p-name">
            <Input id="p-name" name="name" defaultValue={values.name ?? ""} />
          </Field>
          <Field label="綽號" htmlFor="p-nickname">
            <Input
              id="p-nickname"
              name="nickname"
              defaultValue={values.nickname ?? ""}
              placeholder="暱稱 / 顯示名稱"
            />
          </Field>
          <Field label="職稱" htmlFor="p-job">
            <Input
              id="p-job"
              name="jobTitle"
              defaultValue={values.jobTitle ?? ""}
              placeholder="例：業務 / 工程 / PM"
            />
          </Field>
          <Field label="出席情況" htmlFor="p-attendance">
            <Input
              id="p-attendance"
              name="attendance"
              defaultValue={values.attendance ?? ""}
              placeholder="例：全職 / 每週二三 / 遠端"
            />
          </Field>
          <Field
            label="Email（登入身分）"
            htmlFor="p-email"
            hint="用來登入的 Email；修改後需用新 Email 登入。"
            className="sm:col-span-2"
          >
            <Input
              id="p-email"
              name="email"
              type="email"
              defaultValue={values.email ?? ""}
              placeholder="name@example.com"
            />
          </Field>
        </div>
        <label className="bg-muted/40 hover:bg-muted/60 flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors">
          <input
            type="checkbox"
            name="useNickname"
            defaultChecked={values.useNickname}
            className="accent-primary h-4 w-4"
          />
          全站顯示時用<strong className="font-semibold">綽號</strong>取代真實姓名
        </label>
      </section>

      {/* ── 角色與描述 ── */}
      <section className="space-y-3">
        <SectionLabel>角色與描述</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Persona（角色定位）" htmlFor="p-persona">
            <Textarea
              id="p-persona"
              name="persona"
              rows={3}
              defaultValue={values.persona ?? ""}
              placeholder="在團隊中扮演的角色 / 定位…"
            />
          </Field>
          <Field label="個性" htmlFor="p-personality">
            <Textarea
              id="p-personality"
              name="personality"
              rows={3}
              defaultValue={values.personality ?? ""}
              placeholder="個性特質、溝通風格、合作偏好…"
            />
          </Field>
          <Field label="簡介 / 備註" htmlFor="p-bio">
            <Textarea
              id="p-bio"
              name="bio"
              rows={3}
              defaultValue={values.bio ?? ""}
            />
          </Field>
          <Field label="生產力 / 績效備註" htmlFor="p-prod">
            <Textarea
              id="p-prod"
              name="productivityNote"
              rows={3}
              defaultValue={values.productivityNote ?? ""}
              placeholder="近期產出、表現、需協助之處…"
            />
          </Field>
        </div>
      </section>

      {/* ── 團隊設定 ── */}
      <section className="space-y-3">
        <SectionLabel>團隊設定</SectionLabel>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
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
      </section>

      {/* ── 存取權限 ── */}
      <section className="space-y-3">
        <SectionLabel>存取權限</SectionLabel>
        <div className="space-y-2.5 rounded-lg border p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="allModules"
              checked={allAccess}
              onChange={(e) => setAllAccess(e.currentTarget.checked)}
              className="accent-primary h-4 w-4"
            />
            可存取<strong className="font-semibold">全部</strong>模組
          </label>
          {!allAccess && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-2.5 sm:grid-cols-3">
              {MODULES.map((m) => (
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
            未勾「全部」時，此成員只看得到勾選的頁面。老闆一律可見全部。
          </p>
        </div>
      </section>

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
      {children}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}
