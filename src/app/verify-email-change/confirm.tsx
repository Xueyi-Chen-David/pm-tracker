"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { confirmEmailChange } from "@/server/actions/email-change";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ConfirmEmailChange({
  token,
  newEmail,
}: {
  token: string;
  newEmail: string;
}) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setError(null);
    start(async () => {
      const res = await confirmEmailChange(token);
      if (res.ok) setDone(res.email ?? newEmail);
      else setError(res.error ?? "變更失敗。");
    });
  }

  if (done) {
    return (
      <div className="space-y-3 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
        <h1 className="text-lg font-semibold">Email 已變更</h1>
        <p className="text-muted-foreground text-sm">
          你的登入 Email 已改為
          <br />
          <b className="text-foreground">{done}</b>
        </p>
        <p className="text-muted-foreground text-xs">
          下次請用新的 Email 登入。
        </p>
        <Link href="/login" className={cn(buttonVariants(), "w-full")}>
          前往登入
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-center">
      <h1 className="text-lg font-semibold">確認變更登入 Email</h1>
      <p className="text-muted-foreground text-sm">
        確認後，這個帳號的登入 Email 會變更為
        <br />
        <b className="text-foreground">{newEmail}</b>
      </p>
      {error && (
        <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
          {error}
        </p>
      )}
      <Button onClick={confirm} disabled={pending} className="w-full">
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> 處理中…
          </>
        ) : (
          "確認變更"
        )}
      </Button>
    </div>
  );
}
