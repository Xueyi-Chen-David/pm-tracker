/**
 * Gemini 計費換算（前後端共用）。價格為 Google 官方付費方案，每 100 萬 tokens 的美金價，
 * 來源 https://ai.google.dev/gemini-api/docs/pricing（2026-09 查詢）。價格調整時更新這裡；
 * 每筆 AiUsage 在寫入當下就把費用算好存進 costUsd，之後改價不影響歷史紀錄。
 */

type Price = { input: number; audioInput: number; output: number };

const PRICES: Record<string, Price> = {
  "gemini-2.5-flash": { input: 0.3, audioInput: 1.0, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, audioInput: 0.3, output: 0.4 },
  "gemini-3.1-flash-lite": { input: 0.25, audioInput: 0.5, output: 1.5 },
  "gemini-3.5-flash-lite": { input: 0.3, audioInput: 0.3, output: 2.5 },
};

const FALLBACK = PRICES["gemini-2.5-flash"]!;

/** 以 input / output tokens 算一次呼叫的美金費用。audio=true 時輸入用音訊單價。 */
export function aiCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  opts: { audio?: boolean } = {},
): number {
  const p = PRICES[model] ?? FALLBACK;
  const inPrice = opts.audio ? p.audioInput : p.input;
  return (inputTokens * inPrice + outputTokens * p.output) / 1_000_000;
}

/** 顯示用的約略台幣匯率（非即時匯率，僅供估算）。 */
export const USD_TO_TWD = 32;

export function formatUsd(v: number): string {
  if (v === 0) return "US$0";
  if (v < 0.01) return `US$${v.toFixed(4)}`;
  return `US$${v.toFixed(2)}`;
}

export function formatTwd(v: number): string {
  const twd = v * USD_TO_TWD;
  if (twd === 0) return "NT$0";
  if (twd < 1) return `NT$${twd.toFixed(2)}`;
  return `NT$${Math.round(twd).toLocaleString("zh-TW")}`;
}
