/**
 * Gemini 呼叫工具（server-only）。用途：名片 OCR（CRM）與日本食品包裝 OCR（食品標示模組）。
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

const IMAGE_DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const IMAGE_MAX_LEN = 1_500_000; // 約 1.1MB 原始圖片（前端已壓縮，這是防呆上限）

/** 檢查前端送來的圖片 data URL（格式與大小）。 */
export function validateImageDataUrl(
  v: string,
  label = "圖片",
): { ok: true } | { ok: false; error: string } {
  if (!IMAGE_DATA_URL_RE.test(v)) return { ok: false, error: `${label}格式不正確。` };
  if (v.length > IMAGE_MAX_LEN)
    return { ok: false, error: `${label}太大，請換小一點的圖片。` };
  return { ok: true };
}

/**
 * 送一張圖片 + prompt 給 Gemini，要求回傳 JSON 物件。
 * 429 / 5xx 退避重試；逾時 30 秒。所有 OCR 功能共用這一份，各自只負責 prompt 與欄位解析。
 */
async function callGeminiJson(
  prompt: string,
  dataUrl: string,
  maxOutputTokens: number,
  /** 解析失敗時錯誤訊息裡的主詞，例如「名片內容」。 */
  subject: string,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const apiKey = (process.env.GOOGLE_API_KEY ?? "").trim();
  if (!apiKey) return { ok: false, error: "未設定 GOOGLE_API_KEY，無法辨識。" };

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
        parts: [{ text: prompt }, { inlineData: { mimeType, data } }],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      maxOutputTokens,
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
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
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

    const raw =
      json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(backoffMs(attempt));
        continue;
      }
      return { ok: false, error: `無法辨識${subject}，請手動輸入。` };
    }
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, error: `無法辨識${subject}，請手動輸入。` };
    }
    return { ok: true, data: parsed as Record<string, unknown> };
  }
  return { ok: false, error: lastErr || "Gemini 呼叫失敗" };
}

/** 取字串欄位；空字串 / 非字串一律視為沒辨識到。 */
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
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
  const res = await callGeminiJson(EXTRACT_PROMPT, dataUrl, 1024, "名片內容");
  if (!res.ok) return res;
  const p = res.data;
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

// ── 食品標示模組：日本食品包裝 OCR ──────────────────────────────

export type FoodLabelOcrFields = {
  /** 商品名（日文原名） */
  productName: string | null;
  /** 製造者 / 販売者 */
  supplier: string | null;
  /** 「栄養成分表示」區塊的原文逐行文字（含「〜当たり」那一行） */
  nutritionText: string | null;
  /** 内容量的數值（公克或毫升） */
  netContent: number | null;
  /** 固體或液體 */
  state: "solid" | "liquid" | null;
};

/**
 * OCR 只負責「把包裝上的字讀出來」，**不做**任何營養標示的換算或判斷——
 * 換算與合規判定一律交給 src/lib/foodlabel 的規則引擎。
 * 讓 AI 去算法規，結果不可稽核也無法版本化，這條界線要守住。
 */
const FOOD_LABEL_PROMPT = `你是日本食品包裝辨識助手。請閱讀這張日本食品包裝的照片，擷取以下欄位並以 JSON 回傳：
{"productName": 商品名, "supplier": 製造者或販売者, "nutritionText": 栄養成分表示區塊的原文, "netContent": 内容量的數字, "state": "solid" 或 "liquid"}

規則：
- nutritionText 請**逐字照抄**「栄養成分表示」區塊的所有文字，一項一行，保留原本的日文欄位名與數值單位。
  務必包含基準那一行（例如「100g当たり」「1袋（45g）当たり」「1食分当たり」），那一行決定後續換算，不可省略。
  範例格式：
  栄養成分表示（100g当たり）
  エネルギー 350kcal
  たんぱく質 8.2g
  脂質 12.5g
  炭水化物 50.2g
  食塩相当量 1.2g
- **不要**做任何單位換算、不要把食塩相当量換算成鈉、不要自行加總或推算沒印在包裝上的數值。照抄就好。
- netContent 只填數字（例如「内容量 180g」就填 180）；看不到就填 null。
- state：飲料 / 液體填 "liquid"，其餘填 "solid"；判斷不出來填 null。
- 找不到的欄位填 null，不要瞎猜。
- 只回傳 JSON，不要任何其他文字。`;

/** 讀一張日本食品包裝照片，回傳商品資訊與「栄養成分表示」原文。 */
export async function extractFoodLabel(
  dataUrl: string,
): Promise<{ ok: true; fields: FoodLabelOcrFields } | { ok: false; error: string }> {
  // nutritionText 是逐行原文，token 上限要比名片寬。
  const res = await callGeminiJson(FOOD_LABEL_PROMPT, dataUrl, 2048, "包裝內容");
  if (!res.ok) return res;
  const p = res.data;
  const num = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const state = str(p.state);
  return {
    ok: true,
    fields: {
      productName: str(p.productName),
      supplier: str(p.supplier),
      nutritionText: str(p.nutritionText),
      netContent: num(p.netContent),
      state: state === "liquid" ? "liquid" : state === "solid" ? "solid" : null,
    },
  };
}
