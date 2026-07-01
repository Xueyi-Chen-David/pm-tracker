"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { List, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

export function ViewToggle({
  view,
  basePath = "/projects",
}: {
  view: "list" | "card";
  basePath?: string;
}) {
  const params = useSearchParams();

  // 切換檢視時保留現有的篩選 / 排序參數，只改 view
  const hrefFor = (next: "list" | "card") => {
    const sp = new URLSearchParams(params.toString());
    sp.set("view", next);
    return `${basePath}?${sp.toString()}`;
  };

  return (
    <div className="bg-muted inline-flex items-center rounded-lg p-0.5">
      <Item href={hrefFor("list")} active={view === "list"} label="列表">
        <List className="h-4 w-4" />
      </Item>
      <Item href={hrefFor("card")} active={view === "card"} label="卡片">
        <LayoutGrid className="h-4 w-4" />
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
