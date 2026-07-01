/**
 * 顯示名稱工具。
 * - 主名稱一律是「真實姓名」（無則退回 email）。
 * - 綽號（英文名）為「附加」資訊：當成員勾選 useNickname 時，顯示在主名稱旁邊。
 *   純文字情境用 displayName()（會接成「真實姓名 綽號」）；需要把綽號渲染成小字時用
 *   <MemberName>（components/member-name.tsx）。
 */
export type NameSource = {
  name?: string | null;
  nickname?: string | null;
  useNickname?: boolean | null;
  email?: string | null;
};

/** 主名稱：真實姓名 → email → 未命名。 */
export function primaryName(u: NameSource | null | undefined): string {
  if (!u) return "—";
  return u.name?.trim() || u.email?.trim() || "未命名";
}

/** 是否要附加顯示綽號。 */
export function hasNickname(u: NameSource | null | undefined): boolean {
  return !!(u && u.useNickname && u.nickname?.trim());
}

/** 純文字用：勾選綽號時接成「真實姓名 綽號」。 */
export function displayName(u: NameSource | null | undefined): string {
  if (!u) return "—";
  const primary = primaryName(u);
  return hasNickname(u) ? `${primary} ${u!.nickname!.trim()}` : primary;
}

/**
 * 完整名稱：只要有綽號（英文名）就一律附加，不看 useNickname 旗標。
 * 用於需要完整辨識身分的場合（如操作紀錄 / 備註署名）。
 */
export function displayNameFull(u: NameSource | null | undefined): string {
  if (!u) return "—";
  const primary = primaryName(u);
  const nick = u.nickname?.trim();
  return nick && nick !== primary ? `${primary}（${nick}）` : primary;
}

/** 頭像縮寫：取主名稱（真實姓名）首字。 */
export function displayInitial(u: NameSource | null | undefined): string {
  const n = primaryName(u);
  return n === "—" ? "?" : n.slice(0, 1).toUpperCase();
}
