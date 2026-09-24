"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronsDownUp, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 專案清單「全部收合 / 全部展開」：跟單張卡片的收合鈕共用 URL 的 `collapsed` 參數
 * （預設全部展開、collapsed 記錄被收合者），所以收合後仍可個別再展開某一張。
 */
export function CollapseAllButton({
  ids,
  allCollapsed,
}: {
  ids: string[];
  allCollapsed: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("expand");
    if (allCollapsed) params.delete("collapsed");
    else params.set("collapsed", ids.join(","));
    const qs = params.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  return (
    <Button variant="outline" size="sm" className="h-8 gap-1.5" disabled={pending} onClick={toggle}>
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : allCollapsed ? (
        <ChevronsUpDown className="h-4 w-4" />
      ) : (
        <ChevronsDownUp className="h-4 w-4" />
      )}
      {allCollapsed ? "全部展開" : "全部收合"}
    </Button>
  );
}
