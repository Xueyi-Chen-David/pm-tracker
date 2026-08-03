/**
 * Gemini 呼叫工具（server-only）。目前唯一用途：名片 OCR 自動填寫聯絡人欄位。
 * 沿用 skybot/src/lib/ai/gemini-json.ts 的作法：純 fetch 打 REST API（不裝 SDK），
 * 強制 JSON 輸出 + 429/5xx 退避重試。env 用 GOOGLE_API_KEY，跟 skybot 同一個慣例。
 * 未設定 GOOGLE_API_KEY 時整個功能靜默關閉（呼叫端用 isAiEnabled() 先擋掉 UI）。
 */

const DEFAULT_MODEL = "gemini-2.5-flash";

export function isAiEnabled(): boolean {
  return !!(process.env.GOOGLE_API_KEY ?? "").trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(500 * 2 ** (attempt - 1), 4_000) + Math.floor(Math.random() * 300);
}

export type BusinessCardFields = {
  name: string | null;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
};

const EXTRACT_PROMPT = `你是名片辨識助手。請閱讀這張名片圖片，擷取以下欄位並以 JSON 回傳：
{"name": 姓名, "company": 公司名稱, "title": 職稱, "email": Email, "phone": 電話}
規則：
- 找不到的欄位填 null，不要瞎猜。
- name 只填人名，不要包含職稱或公司。
- phone 保留名片上原本的格式（可含區碼 / 分機）。
- 只回傳 JSON，不要任何其他文字。`;

/**
 * 讀一張名片圖片（data URL），回傳結構化欄位；GOOGLE_API_KEY 未設定或呼叫失敗時回傳錯誤訊息。
 */
export async function extractBusinessCard(
  dataUrl: string,
): Promise<{ ok: true; fields: BusinessCardFields } | { ok: false; error: string }> {
  const apiKey = (process.env.GOOGLE_API_KEY ?? "").trim();
  if (!apiKey) return { ok: false, error: "未設定 GOOGLE_API_KEY，無法辨識名片。" };

  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!m) return { ok: false, error: "圖片格式不正確。" };
  const mimeType = m[1]!;
  const data = m[2]!;

  const model = (process.env.CRM_CARD_OCR_MODEL ?? DEFAULT_MODEL).trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [{ text: EXTRACT_PROMPT }, { inlineData: { mimeType, data } }],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      maxOutputTokens: 1024,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const MAX_ATTEMPTS = 3;
  const TIMEOUT_MS = 30_000;
  let lastErr = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      lastErr = e instanceof Error ? e.message : String(e);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(backoffMs(attempt));
        continue;
      }
      return { ok: false, error: `連線 Gemini 失敗：${lastErr}` };
    }
    clearTimeout(timer);

    const json = (await res.json().catch(() => ({}))) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      error?: { message?: string };
    };

    if (!res.ok) {
      const transient = res.status === 429 || res.status >= 500;
      lastErr = json.error?.message ?? `HTTP ${res.status}`;
      if (transient && attempt < MAX_ATTEMPTS) {
        await sleep(backoffMs(attempt));
        continue;
      }
      return { ok: false, error: `Gemini 回傳錯誤：${lastErr}` };
    }

    const raw = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(backoffMs(attempt));
        continue;
      }
      return { ok: false, error: "無法辨識名片內容，請手動輸入。" };
    }
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, error: "無法辨識名片內容，請手動輸入。" };
    }
    const p = parsed as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    return {
      ok: true,
      fields: {
        name: str(p.name),
        company: str(p.company),
        title: str(p.title),
        email: str(p.email),
        phone: str(p.phone),
      },
    };
  }
  return { ok: false, error: lastErr || "Gemini 呼叫失敗" };
}
