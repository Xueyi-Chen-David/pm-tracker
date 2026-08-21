import crypto from "node:crypto";
import { db } from "@/server/db";
import { decryptSecret } from "@/server/encryption";

/**
 * Google 日曆同步（server-only）：請假 / 出差等成員事件核准後，自動在組織指定的
 * Google 日曆寫一筆全天事件。用「服務帳戶」代表整個 App，不是每個使用者各自 OAuth
 * ——後者需要每人重新登入同意「日曆」權限、還得管理 refresh token，這個 repo（NextAuth）
 * 目前完全沒有這套機制；服務帳戶只要管理者把組織要同步的日曆分享給服務帳戶信箱
 * （「進行變更」權限），設定一次即可，跟哪個員工登入無關。
 *
 * 不裝 googleapis SDK：service account 的 JWT bearer 授權用 Node 內建 crypto 手刻
 * RS256 簽章即可換到 access token，其餘走 Calendar API v3 REST——沿用 server/gemini.ts
 * 「純 fetch 不裝 SDK」的慣例。
 *
 * 事件 id 用來源紀錄（LeaveRequest / MemberEvent）的 id 決定性推導（sha256 前 32 碼，
 * 落在 Google 允許的 a-v0-9 字元集內），不用另外開欄位存 googleEventId：新增走 insert，
 * 409（已存在）就轉 update，天生冪等——同一筆請假 / 出差重複觸發同步不會重複建立事件，
 * 刪除也能直接用同一個推導出來的 id 打，不需要先查。
 *
 * 任何錯誤都只記 log、不 throw／不影響回傳值——行事曆同步失敗不該讓簽核、登記出差失敗。
 *
 * 每組織可自訂服務帳戶（Organization.googleCalendarClientEmail /
 * googleCalendarPrivateKeyEncrypted）：多租戶下所有組織預設共用系統的服務帳戶
 * （env GOOGLE_CALENDAR_CLIENT_EMAIL/_PRIVATE_KEY），組織可以改用自己建立的服務帳戶
 * 覆寫，兩個欄位都有值才生效；沒設定就 fallback 回系統預設，不會影響其他組織。
 *
 * 模擬使用者 / 網域範圍委派（Organization.googleCalendarImpersonateUser）：KORVVA 案例
 * 證實——目標日曆若屬於 Google Workspace 網域，直接把日曆分享給服務帳戶（不管服務帳戶
 * 是哪個 GCP 專案的、換幾把金鑰）ACL 角色即使確認是 writer，實際寫入仍一律 403。Google
 * 官方文件講得很明確：網域擁有的日曆只認「網域範圍委派」（服務帳戶模擬網域內某個真實
 * 使用者操作），不認直接 ACL 分享這條路——這是這裡最終真正解決寫入被拒的方法，不是
 * 「換專案」或「重設 ACL」。設定 googleCalendarImpersonateUser 後 JWT 會多帶 sub claim；
 * 前提是網域管理員已在 Admin 控制台「安全性 → API 控制項 → 網域範圍委派」把服務帳戶的
 * 用戶端 ID 授權 calendar 範圍，且被模擬的使用者本身要對目標日曆有權限。
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

type Credentials = { clientEmail: string; privateKey: string; impersonateUser?: string };

/** 系統預設服務帳戶（env）的 email/私鑰，不含模擬使用者——那個一律來自組織自己的設定
 *  （googleCalendarImpersonateUser），因為要模擬誰是「哪個網域」的問題，跟用哪個服務
 *  帳戶去模擬是兩件事：即使用系統共用的預設服務帳戶，只要該組織的 Workspace 管理員把
 *  這個服務帳戶的用戶端 ID 授權了網域範圍委派，一樣可以模擬自己網域內的使用者。 */
function defaultServiceAccount(): { clientEmail: string; privateKey: string } | null {
  const clientEmail = (process.env.GOOGLE_CALENDAR_CLIENT_EMAIL ?? "").trim();
  const privateKey = (process.env.GOOGLE_CALENDAR_PRIVATE_KEY ?? "")
    .trim()
    // .env / Vercel 環境變數塞多行 PEM 時常是字面上的 "\n"，換回真正的換行。
    .replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) return null;
  return { clientEmail, privateKey };
}

/** 系統預設服務帳戶（env）是否已設定——UI 用來判斷「沒設自訂憑證的組織能不能用」。 */
export function isCalendarSyncConfigured(): boolean {
  return defaultServiceAccount() !== null;
}

/** 私鑰是否為可用的 PEM 格式（存自訂憑證前先驗證，別讓打錯格式的內容默默存進資料庫）。 */
export function isValidPrivateKeyPem(privateKey: string): boolean {
  try {
    crypto.createSign("RSA-SHA256").update("validate").sign(privateKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * 解析某組織實際該用的服務帳戶：組織自訂（兩欄位都有值）優先，否則 fallback 回系統預設；
 * 模擬使用者（googleCalendarImpersonateUser）一律來自組織自己的設定，不管用的是自訂還是
 * 系統預設服務帳戶都會套用——見上面 defaultServiceAccount() 的說明。
 * 私鑰解密失敗（ENCRYPTION_KEY 換過 / 資料被動過手腳）視為組織自訂憑證不可用，
 * 不會靜默改用系統預設（那不是使用者的意圖，且系統預設對這個組織可能本來就進不去）。
 */
async function resolveCredentials(
  orgId: string,
): Promise<{ credentials: Credentials; source: "org" | "default" } | null> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: {
      googleCalendarClientEmail: true,
      googleCalendarPrivateKeyEncrypted: true,
      googleCalendarImpersonateUser: true,
    },
  });
  const impersonateUser = org?.googleCalendarImpersonateUser?.trim() || undefined;

  if (org?.googleCalendarClientEmail && org.googleCalendarPrivateKeyEncrypted) {
    try {
      const privateKey = decryptSecret(org.googleCalendarPrivateKeyEncrypted)
        .trim()
        .replace(/\\n/g, "\n");
      return {
        credentials: { clientEmail: org.googleCalendarClientEmail, privateKey, impersonateUser },
        source: "org",
      };
    } catch (e) {
      console.error(`[google-calendar] 組織 ${orgId} 自訂服務帳戶私鑰解密失敗`, e);
      return null;
    }
  }
  const fallback = defaultServiceAccount();
  return fallback ? { credentials: { ...fallback, impersonateUser }, source: "default" } : null;
}

/**
 * 目前這個組織「實際會用哪個服務帳戶」的信箱 + 有沒有設模擬使用者（不含私鑰，給設定頁
 * 顯示用）。回傳 null 代表完全沒有可用的服務帳戶（沒自訂、系統預設也沒設）。
 */
export async function getEffectiveServiceAccountEmail(orgId: string): Promise<{
  email: string;
  source: "org" | "default";
  impersonateUser?: string;
} | null> {
  const resolved = await resolveCredentials(orgId);
  return resolved
    ? {
        email: resolved.credentials.clientEmail,
        source: resolved.source,
        impersonateUser: resolved.credentials.impersonateUser,
      }
    : null;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// access token 快取，key 帶 clientEmail + impersonateUser——不同組織可能用不同服務帳戶，
// 同一個服務帳戶也可能模擬不同使用者，換出來的 token 代表的身分不一樣，不能共用快取。
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function cacheKey(credentials: Credentials): string {
  return `${credentials.clientEmail}::${credentials.impersonateUser ?? ""}`;
}

async function getAccessToken(credentials: Credentials): Promise<string | null> {
  const key = cacheKey(credentials);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: credentials.clientEmail,
      scope: CALENDAR_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
      // 網域範圍委派：有設定才帶 sub，讓服務帳戶模擬這個使用者操作（見檔頭說明）。
      ...(credentials.impersonateUser ? { sub: credentials.impersonateUser } : {}),
    }),
  );
  const signInput = `${header}.${claims}`;
  let signature: Buffer;
  try {
    signature = crypto.createSign("RSA-SHA256").update(signInput).sign(credentials.privateKey);
  } catch (e) {
    console.error("[google-calendar] 服務帳戶私鑰格式錯誤", e);
    return null;
  }
  const jwt = `${signInput}.${base64url(signature)}`;

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
  } catch (e) {
    console.error("[google-calendar] 換 access token 連線失敗", e);
    return null;
  }
  if (!res.ok) {
    console.error(
      "[google-calendar] 換 access token 失敗",
      res.status,
      await res.text().catch(() => ""),
    );
    return null;
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(key, {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  });
  return json.access_token;
}

/** 把來源紀錄 id 決定性推導成 Google 允許的事件 id（僅 a-v 與數字，5–1024 碼）。 */
function toEventId(sourceKey: string): string {
  return crypto.createHash("sha256").update(sourceKey).digest("hex").slice(0, 32);
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Google 全天事件的 end 是「不含」的（跟本專案 @db.Date 的 inclusive endDate 不同），要 +1 天。 */
function exclusiveEnd(end: Date): string {
  const d = new Date(end.getTime());
  d.setUTCDate(d.getUTCDate() + 1);
  return ymd(d);
}

type UpsertInput = {
  credentials: Credentials;
  calendarId: string;
  sourceKey: string; // 例如 `leave:${requestId}`、`member-event:${eventId}`，決定事件 id
  summary: string;
  description?: string | null;
  startDate: Date;
  endDate: Date; // inclusive
};

/**
 * 新增或覆寫（冪等）一筆全天行事曆事件。回傳是否成功——一般呼叫端（簽核 / 登記
 * server action）不看這個值（同步失敗不該擋主流程），但「手動補同步歷史紀錄」
 * 的按鈕需要統計成功幾筆、失敗幾筆給管理者看。
 */
async function upsertCalendarEvent(input: UpsertInput): Promise<boolean> {
  const token = await getAccessToken(input.credentials);
  if (!token) return false;
  const eventId = toEventId(input.sourceKey);
  const body = JSON.stringify({
    id: eventId,
    summary: input.summary,
    description: input.description ?? undefined,
    start: { date: ymd(input.startDate) },
    end: { date: exclusiveEnd(input.endDate) },
  });
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events`;

  try {
    const insertRes = await fetch(base, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body,
    });
    if (insertRes.ok) return true;
    // 事件已存在（同一筆來源紀錄重複同步，例如簽核進度重算）→ 改用 update，一樣冪等。
    if (insertRes.status === 409) {
      const updateRes = await fetch(`${base}/${eventId}`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body,
      });
      if (!updateRes.ok) {
        console.error(
          "[google-calendar] 更新事件失敗",
          updateRes.status,
          await updateRes.text().catch(() => ""),
        );
        return false;
      }
      return true;
    }
    console.error(
      "[google-calendar] 新增事件失敗",
      insertRes.status,
      await insertRes.text().catch(() => ""),
    );
    return false;
  } catch (e) {
    console.error("[google-calendar] 同步失敗", e);
    return false;
  }
}

/** 刪除一筆先前同步的事件。找不到（早已刪除或從未同步過）視為成功，不算錯誤。 */
async function deleteCalendarEvent(
  credentials: Credentials,
  calendarId: string,
  sourceKey: string,
): Promise<boolean> {
  const token = await getAccessToken(credentials);
  if (!token) return false;
  const eventId = toEventId(sourceKey);
  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
      { method: "DELETE", headers: { authorization: `Bearer ${token}` } },
    );
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      console.error(
        "[google-calendar] 刪除事件失敗",
        res.status,
        await res.text().catch(() => ""),
      );
      return false;
    }
    return true;
  } catch (e) {
    console.error("[google-calendar] 刪除事件時發生錯誤", e);
    return false;
  }
}

/**
 * 請假 / 出差核准後呼叫：同步進該組織設定的 Google 日曆。組織未設定 googleCalendarId、
 * 或沒有任何可用的服務帳戶（自訂 + 系統預設都沒有）時靜默略過（不影響呼叫端的簽核 /
 * 登記流程），回傳 false。
 */
export async function syncMemberAbsenceToCalendar(opts: {
  orgId: string;
  sourceKey: string;
  memberName: string;
  typeLabel: string; // 顯示在事件標題，如「請假（特休）」、「出差」
  note?: string | null;
  startDate: Date;
  endDate: Date;
}): Promise<boolean> {
  const org = await db.organization.findUnique({
    where: { id: opts.orgId },
    select: { googleCalendarId: true },
  });
  const calendarId = org?.googleCalendarId?.trim();
  if (!calendarId) return false;
  const resolved = await resolveCredentials(opts.orgId);
  if (!resolved) return false;
  return upsertCalendarEvent({
    credentials: resolved.credentials,
    calendarId,
    sourceKey: opts.sourceKey,
    summary: `${opts.typeLabel} - ${opts.memberName}`,
    description: opts.note ?? undefined,
    startDate: opts.startDate,
    endDate: opts.endDate,
  });
}

/** 請假 / 出差被刪除、駁回定案後撤銷時呼叫：把先前同步的事件從日曆移除。 */
export async function removeMemberAbsenceFromCalendar(
  orgId: string,
  sourceKey: string,
): Promise<boolean> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { googleCalendarId: true },
  });
  const calendarId = org?.googleCalendarId?.trim();
  if (!calendarId) return false;
  const resolved = await resolveCredentials(orgId);
  if (!resolved) return false;
  return deleteCalendarEvent(resolved.credentials, calendarId, sourceKey);
}
