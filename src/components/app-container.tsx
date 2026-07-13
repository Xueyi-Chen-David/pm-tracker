"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// 這些路由不套用 max-width 上限，改用整個可用寬度（全寬）。
const FULL_WIDTH_PREFIXES = ["/training"];

/**
 * 頁面內容容器。預設置中並限制最大寬度（max-w-[90rem]）；
 * 少數需要全寬的頁面（如教育訓練文件庫）則放寬到滿版，只保留左右內距。
 */
export function AppContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullWidth = FULL_WIDTH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  return (
    <div
      className={cn(
        "w-full px-4 py-6 sm:px-6 lg:px-8",
        !fullWidth && "mx-auto max-w-[90rem]",
      )}
    >
      {children}
    </div>
  );
}
