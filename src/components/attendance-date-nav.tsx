"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AttendanceDateNav({
  date,
  today,
}: {
  date: string; // yyyy-mm-dd
  today: string;
}) {
  const router = useRouter();

  function go(d: string) {
    router.push(`/attendance?date=${d}`);
  }
  function shift(days: number) {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    go(d.toISOString().slice(0, 10));
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="icon-sm"
        title="前一天"
        onClick={() => shift(-1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <input
        type="date"
        value={date}
        onChange={(e) => go(e.target.value)}
        className="border-input h-8 rounded-md border bg-transparent px-2 text-sm outline-none"
      />
      <Button
        variant="outline"
        size="icon-sm"
        title="後一天"
        onClick={() => shift(1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      {date !== today && (
        <Button variant="ghost" size="sm" onClick={() => go(today)}>
          <RotateCcw className="h-4 w-4" /> 今天
        </Button>
      )}
    </div>
  );
}
