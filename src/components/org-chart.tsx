import Link from "next/link";
import { Crown } from "lucide-react";
import { MemberName } from "@/components/member-name";
import type { NameSource } from "@/lib/display";

export type OrgChartEntry = NameSource & {
  id: string; // user id（連到個人頁）
  image?: string | null;
  membershipId: string;
  managerId: string | null;
  secondaryManagerIds?: string[]; // 額外（虛線）回報對象的 membership id
  jobTitle: string | null;
  department?: string | null;
  isBoss: boolean;
};

/** 唯讀組織架構樹（依上級主管關係）。指派主管在個人 profile 內設定。 */
export function OrgChart({ members }: { members: OrgChartEntry[] }) {
  if (members.length === 0) return null;

  const ids = new Set(members.map((m) => m.membershipId));
  const byManager = new Map<string, OrgChartEntry[]>();
  const roots: OrgChartEntry[] = [];
  for (const m of members) {
    if (m.managerId && ids.has(m.managerId)) {
      const arr = byManager.get(m.managerId);
      if (arr) arr.push(m);
      else byManager.set(m.managerId, [m]);
    } else {
      roots.push(m);
    }
  }

  function renderNode(node: OrgChartEntry, depth: number, seen: Set<string>) {
    if (seen.has(node.membershipId)) return null; // 防環
    seen.add(node.membershipId);
    const children = byManager.get(node.membershipId) ?? [];
    return (
      <div key={node.membershipId}>
        <div
          className="flex items-center gap-2 py-1.5 text-sm"
          style={{ paddingLeft: depth * 20 }}
        >
          {depth > 0 && <span className="text-muted-foreground">└</span>}
          <Link href={`/me/${node.id}`} className="hover:underline">
            <MemberName u={node} className="font-medium" />
          </Link>
          {node.isBoss && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
          {node.jobTitle && (
            <span className="text-muted-foreground text-xs">· {node.jobTitle}</span>
          )}
        </div>
        {children.map((c) => renderNode(c, depth + 1, seen))}
      </div>
    );
  }

  const seen = new Set<string>();
  return (
    <div className="bg-card rounded-xl border p-3">
      {roots.map((r) => renderNode(r, 0, seen))}
    </div>
  );
}
