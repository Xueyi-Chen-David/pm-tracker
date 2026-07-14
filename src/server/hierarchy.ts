/**
 * 團隊組織架構（主管 → 下屬）的純運算工具。以 OrganizationMember 的
 * (id, userId, managerId) 建圖；每日報告的可見範圍由此推得。
 *
 * 可見規則（配合 Organization.dailyReportChainVisible）：
 *   - chainVisible=false：報告只有作者本人 + 直屬主管看得到。
 *   - chainVisible=true ：往上整條主管鏈都看得到（上級的上級也可見）。
 *
 * 另有「額外（虛線）回報對象」secondaryManagerIds：被列為某人額外回報對象者，
 * 與其直屬主管一樣看得到 / 可回饋該人的日報；但此可見性只給被指名的人，
 * 不沿其自身主管鏈往上傳遞（與 chainVisible 無關）。
 */

export type HierNode = {
  id: string;
  userId: string;
  managerId: string | null;
  secondaryManagerIds?: string[];
};

/** managerId → 直屬下屬節點。 */
export function childrenByManager(members: HierNode[]): Map<string, HierNode[]> {
  const map = new Map<string, HierNode[]>();
  for (const m of members) {
    if (!m.managerId) continue;
    const arr = map.get(m.managerId);
    if (arr) arr.push(m);
    else map.set(m.managerId, [m]);
  }
  return map;
}

/** 某成員（membership id）的直屬下屬。 */
export function directReports(members: HierNode[], managerId: string): HierNode[] {
  return members.filter((m) => m.managerId === managerId);
}

/** 某成員底下的整個子樹（所有層級的下屬；不含自己）。 */
export function subtreeMembers(members: HierNode[], rootId: string): HierNode[] {
  const kids = childrenByManager(members);
  const out: HierNode[] = [];
  const seen = new Set<string>([rootId]);
  const stack = [...(kids.get(rootId) ?? [])];
  while (stack.length) {
    const n = stack.pop()!;
    if (seen.has(n.id)) continue; // 防資料出現環
    seen.add(n.id);
    out.push(n);
    const c = kids.get(n.id);
    if (c) stack.push(...c);
  }
  return out;
}

/** viewer 這位成員可看到哪些成員（membership id）的每日報告（不含自己）。 */
export function visibleReportMemberIds(
  members: HierNode[],
  viewerMemberId: string,
  chainVisible: boolean,
): Set<string> {
  const nodes = chainVisible
    ? subtreeMembers(members, viewerMemberId)
    : directReports(members, viewerMemberId);
  const ids = new Set(nodes.map((n) => n.id));
  // 額外（虛線）回報：把「將 viewer 列為額外回報對象」的成員直接納入（不往上傳遞）。
  for (const m of members) {
    if (m.id !== viewerMemberId && m.secondaryManagerIds?.includes(viewerMemberId)) {
      ids.add(m.id);
    }
  }
  return ids;
}

/** viewer 是否可看到 author 的每日報告（本人一律可）。 */
export function canViewReportOf(
  members: HierNode[],
  viewerMemberId: string,
  authorMemberId: string,
  chainVisible: boolean,
): boolean {
  if (viewerMemberId === authorMemberId) return true;
  const byId = new Map(members.map((m) => [m.id, m]));
  const author = byId.get(authorMemberId);
  if (!author) return false;
  if (author.managerId === viewerMemberId) return true; // 直屬主管
  if (author.secondaryManagerIds?.includes(viewerMemberId)) return true; // 額外回報對象
  if (!chainVisible) return false;
  // 沿主管鏈往上找 viewer 是否為祖先。
  let cur = author.managerId ? byId.get(author.managerId) : undefined;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    if (cur.id === viewerMemberId) return true;
    seen.add(cur.id);
    cur = cur.managerId ? byId.get(cur.managerId) : undefined;
  }
  return false;
}

/**
 * 把 memberId 的主管設為 newManagerId 是否會造成循環：
 * newManager 不能是自己，也不能是自己底下的任何下屬。
 */
export function wouldCycle(
  members: HierNode[],
  memberId: string,
  newManagerId: string,
): boolean {
  if (memberId === newManagerId) return true;
  return subtreeMembers(members, memberId).some((n) => n.id === newManagerId);
}
