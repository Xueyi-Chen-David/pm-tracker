/**
 * 極簡寄信：優先用 Resend（HTTP API，Vercel 友善，免額外相依）。
 * 未設定 RESEND_API_KEY 時：把內容印到伺服器 log（開發可測試），並回報 sent=false，
 * 由呼叫端決定要不要在正式環境擋下。
 *
 * 需要的環境變數：
 *   RESEND_API_KEY  —— Resend 的 API 金鑰。
 *   EMAIL_FROM      —— 寄件地址，如 "Project Pulse <noreply@yourdomain.com>"。
 *                      未設定時用 Resend 測試寄件地址 onboarding@resend.dev（僅能寄給帳號本人信箱）。
 */

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ sent: boolean }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Project Pulse <onboarding@resend.dev>";

  if (!key) {
    console.warn(
      `[email] 未設定 RESEND_API_KEY，未寄出：「${args.subject}」→ ${args.to}`,
    );
    console.warn(`[email] 內容：\n${args.text ?? args.html}`);
    return { sent: false };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      ...(args.text ? { text: args.text } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`寄信失敗（${res.status}）：${body.slice(0, 300)}`);
  }
  return { sent: true };
}
