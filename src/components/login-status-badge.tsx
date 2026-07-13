/**
 * 成員登入狀況小標籤：曾用帳號登入過＝「已登入」（綠）；被邀請但還沒登入＝「尚未登入」（琥珀）。
 * 判定來源：該 User 是否有任何 OAuth Account（見 queries.getOrgMembers 的 hasLoggedIn）。
 */
export function LoginStatusBadge({ loggedIn }: { loggedIn: boolean }) {
  return loggedIn ? (
    <span className="shrink-0 rounded bg-emerald-100 px-1.5 text-[10px] text-emerald-700">
      已登入
    </span>
  ) : (
    <span className="shrink-0 rounded bg-amber-100 px-1.5 text-[10px] text-amber-700">
      尚未登入
    </span>
  );
}
