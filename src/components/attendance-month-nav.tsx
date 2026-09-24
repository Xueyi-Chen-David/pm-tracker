"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonthPicker } from "@/components/ui/date-picker";

/** yyyy-MM 月份切換：上個月 / 月份選擇器 / 下個月 / 本月。 */
export function AttendanceMonthNav({
  month,
  thisMonth,
  basePath = "/attendance",
}: {
  month: string; // yyyy-MM
  thisMonth: string; // yyyy-MM
  basePath?: string;
}) {
  const router = useRouter();

  function go(m: string) {
    router.push(`${basePath}?month=${m}`);
  }

  function shift(n: number) {
    const [y, mo] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, mo - 1 + n, 1));
    const next = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    go(next);
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* suppressHydrationWarning：瀏覽器擴充套件（常見如 LastPass）會在 hydrate 前
          替表單旁的按鈕插入 fdprocessedid 屬性，造成 SSR/CSR 屬性不符的假警告——
          跟這兩顆按鈕本身無關（純靜態、無動態內容），故就地壓下即可，不宜整站關閉。 */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => shift(-1)}
        title="上個月"
        suppressHydrationWarning
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <MonthPicker value={month} onChange={go} />
      <Button
        variant="outline"
        size="icon"
        onClick={() => shift(1)}
        title="下個月"
        suppressHydrationWarning
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      {month !== thisMonth && (
        <Button variant="ghost" size="sm" onClick={() => go(thisMonth)}>
          本月
        </Button>
      )}
    </div>
  );
}
