"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** yyyy-MM 月份切換：上個月 / 月份選擇器 / 下個月 / 本月。 */
export function AttendanceMonthNav({
  month,
  thisMonth,
}: {
  month: string; // yyyy-MM
  thisMonth: string; // yyyy-MM
}) {
  const router = useRouter();

  function go(m: string) {
    router.push(`/attendance?month=${m}`);
  }

  function shift(n: number) {
    const [y, mo] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, mo - 1 + n, 1));
    const next = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    go(next);
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="icon"
        onClick={() => shift(-1)}
        title="上個月"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <input
        type="month"
        value={month}
        onChange={(e) => {
          const v = e.currentTarget.value;
          if (v) go(v);
        }}
        className="border-input h-8 rounded-md border bg-transparent px-2 text-sm"
      />
      <Button
        variant="outline"
        size="icon"
        onClick={() => shift(1)}
        title="下個月"
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
