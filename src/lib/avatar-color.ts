/** 頭像圓底色盤——柔和但有辨識度，白色文字在上面都夠對比。 */
const AVATAR_PALETTE = [
  "#16a34a", // green
  "#dc2626", // red
  "#0d9488", // teal
  "#2563eb", // blue
  "#9333ea", // purple
  "#ea580c", // orange
  "#0891b2", // cyan
  "#db2777", // pink
  "#65a30d", // lime
  "#4f46e5", // indigo
];

/** 從字串（通常是 user id）決定性地選一個色盤顏色，確保同一人每次顯示顏色都一樣。 */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}
