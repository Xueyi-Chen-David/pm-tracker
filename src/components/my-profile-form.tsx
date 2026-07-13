"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateMyProfileAction } from "@/server/actions/team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export type MyProfileValues = {
  name: string | null;
  nickname: string | null;
  useNickname: boolean;
  email: string | null;
  bio: string | null;
};

/** 本人編輯自己的個人資料（姓名 / 綽號 / Email / 簡介）。 */
export function MyProfileForm({ values }: { values: MyProfileValues }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const res = await updateMyProfileAction(null, fd);
      if (res?.ok) {
        toast.success("已更新個人資料");
        router.refresh();
      } else {
        setError(res?.error ?? "儲存失敗");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="m-name">真實姓名</Label>
          <Input id="m-name" name="name" defaultValue={values.name ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m-nickname">綽號</Label>
          <Input
            id="m-nickname"
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
        <Label htmlFor="m-email">Email（登入身分）</Label>
        <Input
          id="m-email"
          name="email"
          type="email"
          defaultValue={values.email ?? ""}
          placeholder="name@example.com"
        />
        <p className="text-muted-foreground text-xs">
          這是你用來登入的 Email；修改後需用新 Email 登入。
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="m-bio">簡介 / 備註</Label>
        <Textarea id="m-bio" name="bio" rows={3} defaultValue={values.bio ?? ""} />
      </div>

      {error && (
        <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "儲存中…" : "儲存"}
        </Button>
      </div>
    </form>
  );
}
