import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { db } from "@/server/db";
import { ConfirmEmailChange } from "./confirm";

export const metadata = { title: "驗證 Email · Project Pulse" };

export default async function VerifyEmailChangePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  // 未過期才視為有效：把「未過期」條件放進查詢（render 中避免呼叫 Date.now）。
  const req = token
    ? await db.emailChangeRequest.findFirst({
        where: { token, expiresAt: { gt: new Date() } },
        select: { newEmail: true, organization: { select: { name: true } } },
      })
    : null;

  return (
    <main className="flex min-h-[100dvh] items-center justify-center p-6">
      <div className="bg-card w-full max-w-sm rounded-2xl border p-6 shadow-sm sm:p-8">
        {req ? (
          <ConfirmEmailChange
            token={token!}
            newEmail={req.newEmail}
            orgName={req.organization.name}
          />
        ) : (
          <div className="space-y-3 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
            <h1 className="text-lg font-semibold">連結無效或已過期</h1>
            <p className="text-muted-foreground text-sm">
              這個 Email 驗證連結無效、已使用過或已超過 24 小時。
              請回到個人資料頁重新申請變更。
            </p>
            <Link href="/" className="text-primary text-sm hover:underline">
              回首頁
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
