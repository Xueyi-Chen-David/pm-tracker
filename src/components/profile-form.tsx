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
};

export function ProfileForm({ values }: { values: ProfileValues }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

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
        <Label htmlFor="p-persona">Persona（角色定位）</Label>
        <Textarea
          id="p-persona"
          name="persona"
          rows={2}
          defaultValue={values.persona ?? ""}
          placeholder="這個人在團隊中扮演的角色 / 定位…"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="p-personality">個性</Label>
        <Textarea
          id="p-personality"
          name="personality"
          rows={2}
          defaultValue={values.personality ?? ""}
          placeholder="個性特質、溝通風格、合作偏好…"
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

      <div className="space-y-1.5">
        <Label htmlFor="p-prod">生產力 / 績效備註</Label>
        <Textarea
          id="p-prod"
          name="productivityNote"
          rows={2}
          defaultValue={values.productivityNote ?? ""}
          placeholder="近期產出、表現、需協助之處…"
        />
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
