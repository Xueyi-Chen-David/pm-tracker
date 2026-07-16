/** 每日報告的小工具（純函式，server 與 client 共用）。 */

/** 數量顯示：整數不帶小數，其餘最多兩位。 */
export function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/**
 * 每日報告可用的表情回應（emoji reaction）白名單。
 * 同時給挑選器 UI 與 server action 驗證使用，確保只存得下這幾個表情。
 */
export const REACTION_EMOJIS = [
  "👍",
  "❤️",
  "🎉",
  "👏",
  "🔥",
  "😄",
  "🙏",
  "💪",
] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export function isReactionEmoji(v: string): v is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(v);
}
