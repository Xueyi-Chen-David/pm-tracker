"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, MailCheck } from "lucide-react";
import { requestEmailChange } from "@/server/actions/email-change";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangeEmailCard({
  currentEmail,
  pending,
}: {
  currentEmail: string | null;
  /** 目前是否有待驗證的變更請求（新信箱）。 */
  pending: { newEmail: string } | null;
}) {
  const router = useRouter();
  const [newEmail, setNewEmail] = useState("");
  const [devLink, setDevLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDevLink(null);
    start(async () => {
      const res = await requestEmailChange(newEmail);
      if (res.ok) {
        toast.success("驗證信已寄出，請到新信箱收信");
        setNewEmail("");
        if (res.devLink) setDevLink(res.devLink);
        router.refresh();
      } else {
        setError(res.error ?? "送出失敗");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <Mail className="text-muted-foreground h-4 w-4 shrink-0" />
        <span className="text-muted-foreground">此組織使用的 Email：</span>
        <span className="font-medium break-all">{currentEmail ?? "—"}</span>
      </div>
      <p className="text-muted-foreground text-xs">
        只影響你在這個組織的 Email，不會改變登入方式，也不影響你的其他組織。
      </p>

      {pending && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <MailCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            已寄驗證信到 <b className="break-all">{pending.newEmail}</b>
            ，請到該信箱點連結完成變更（24 小時內有效）。重新送出下方表單可改寄別的信箱。
          </span>
        </div>
      )}

      <form onSubmit={submit} className="space-y-2">
        <Label htmlFor="new-email" className="text-xs">
          變更此組織的 Email（會寄驗證信到新信箱）
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="new-email"
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new@example.com"
            className="sm:flex-1"
          />
          <Button type="submit" disabled={busy} className="shrink-0">
            {busy ? "寄送中…" : "寄送驗證信"}
          </Button>
        </div>
      </form>

      {error && (
        <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
          {error}
        </p>
      )}
      {devLink && (
        <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
          （開發模式：尚未設定寄信服務，直接用此連結驗證）
          <br />
          <a href={devLink} className="text-primary break-all underline">
            {devLink}
          </a>
        </p>
      )}
    </div>
  );
}
