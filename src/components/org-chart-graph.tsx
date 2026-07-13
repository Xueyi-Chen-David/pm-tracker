import Link from "next/link";
import { Crown } from "lucide-react";
import { MemberName } from "@/components/member-name";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { displayInitial } from "@/lib/display";
import type { OrgChartEntry } from "@/components/org-chart";
import styles from "./org-chart-graph.module.css";

/**
 * 視覺化組織圖：由上而下的方框連接樹（每個節點是成員卡）。
 * 資料與 <OrgChart>（縮排列表）共用 OrgChartEntry；上級主管在個人 profile 設定。
 */
export function OrgChartGraph({ members }: { members: OrgChartEntry[] }) {
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

  function renderNode(node: OrgChartEntry, seen: Set<string>) {
    if (seen.has(node.membershipId)) return null; // 防環
    seen.add(node.membershipId);
    const children = byManager.get(node.membershipId) ?? [];
    return (
      <li key={node.membershipId}>
        <div className={styles.node}>
          <NodeCard node={node} />
        </div>
        {children.length > 0 && (
          <ul>{children.map((c) => renderNode(c, seen))}</ul>
        )}
      </li>
    );
  }

  const seen = new Set<string>();
  return (
    <div className="bg-card rounded-xl border p-3">
      <div className={styles.scroll}>
        <div className={styles.tree}>
          <ul>{roots.map((r) => renderNode(r, seen))}</ul>
        </div>
      </div>
    </div>
  );
}

function NodeCard({ node }: { node: OrgChartEntry }) {
  return (
    <Link
      href={`/me/${node.id}`}
      className="bg-background hover:border-primary/50 hover:bg-muted/40 inline-flex w-40 flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-center shadow-sm transition-colors"
    >
      <Avatar className="h-11 w-11">
        {node.image && <AvatarImage src={node.image} alt="" />}
        <AvatarFallback>{displayInitial(node)}</AvatarFallback>
      </Avatar>
      <div className="flex max-w-full items-center gap-1">
        <MemberName u={node} className="min-w-0 text-sm font-medium" />
        {node.isBoss && (
          <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        )}
      </div>
      {node.jobTitle && (
        <span className="text-muted-foreground max-w-full truncate text-xs">
          {node.jobTitle}
        </span>
      )}
    </Link>
  );
}
