import { NextResponse } from "next/server";
import { runDeadlineNotifications } from "@/server/deadlines";

// 需要 Prisma → Node runtime；每次都即時執行、不快取。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 每日到期通知排程端點。由 Vercel Cron（見 vercel.json）每天呼叫一次。
 *
 * 認證：需設 CRON_SECRET 環境變數。
 * - Vercel Cron 會自動帶 `Authorization: Bearer <CRON_SECRET>`。
 * - 手動測試可用 `?secret=<CRON_SECRET>`。
 * 未設 CRON_SECRET 時一律拒絕（避免端點對外開放）。
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET 未設定，到期通知排程已停用。" },
      { status: 503 },
    );
  }

  const bearer = req.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const query = new URL(req.url).searchParams.get("secret");
  if (bearer !== secret && query !== secret) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const summary = await runDeadlineNotifications(new Date());
  return NextResponse.json({ ok: true, ...summary });
}
