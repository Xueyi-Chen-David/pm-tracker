"use client";

import { useEffect, useState } from "react";
import { relativeLabel } from "@/lib/date";

/**
 * 相對時間（「3 天前」）。只在瀏覽器端計算並每分鐘更新，避免伺服器與前端「現在」不一致
 * 造成的 hydration mismatch；掛載前輸出空字串。用於狀態切換時間、操作紀錄等即時感標註。
 */
export function RelativeTime({
  iso,
  className,
  prefix = "",
  suffix = "",
}: {
  iso: string;
  className?: string;
  /** 顯示前綴，如「（」。 */
  prefix?: string;
  /** 顯示後綴，如「）」。 */
  suffix?: string;
}) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const tick = () => setLabel(relativeLabel(iso));
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, [iso]);
  if (!label) return null;
  return (
    <span className={className} suppressHydrationWarning>
      {prefix}
      {label}
      {suffix}
    </span>
  );
}
