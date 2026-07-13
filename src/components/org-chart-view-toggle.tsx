"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Network, ListTree } from "lucide-react";
import { cn } from "@/lib/utils";

/** 組織架構的「列表 / 組織圖」切換（用 ?org= 參數，不影響名冊的 ?view=）。 */
export function OrgViewToggle({
  view,
  basePath = "/team",
}: {
  view: "list" | "graph";
  basePath?: string;
}) {
  const params = useSearchParams();

  const hrefFor = (next: "list" | "graph") => {
    const sp = new URLSearchParams(params.toString());
    sp.set("org", next);
    return `${basePath}?${sp.toString()}`;
  };

  return (
    <div className="bg-muted inline-flex items-center rounded-lg p-0.5">
      <Item href={hrefFor("list")} active={view === "list"} label="列表">
        <ListTree className="h-4 w-4" />
      </Item>
      <Item href={hrefFor("graph")} active={view === "graph"} label="組織圖">
        <Network className="h-4 w-4" />
      </Item>
    </div>
  );
}

function Item({
  href,
  active,
  label,
  children,
}: {
  href: string;
  active: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      replace
      scroll={false}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
      aria-pressed={active}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
