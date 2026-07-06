import { Skeleton } from "@/components/ui/skeleton";

/**
 * (app) 群組的載入骨架。放在 layout（側欄）之內、page 之上，因此換頁時側欄保留、
 * 內容區立刻顯示骨架——不再是「請求已回、畫面卻卡在舊頁」的空窗感。
 */
export default function Loading() {
  return (
    <div>
      {/* 頁首 */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>

      {/* KPI / 摘要卡列 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>

      {/* 內容列表 */}
      <div className="mt-8 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
