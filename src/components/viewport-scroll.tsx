"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * 把內容高度限制在「到視窗底部」的可用高度內，超出則內部垂直捲動（右側出現滑桿）。
 * 依自身在頁面的位置與視窗大小即時量測，縮放視窗會重算。
 */
export function ViewportScroll({
  children,
  bottomGap = 24,
  minHeight = 200,
  className,
}: {
  children: React.ReactNode;
  /** 底部預留（px），避免緊貼視窗邊。 */
  bottomGap?: number;
  /** 最小高度（px），避免內容太少時被壓得太扁。 */
  minHeight?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [maxH, setMaxH] = useState<number>();

  useEffect(() => {
    function recompute() {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setMaxH(Math.max(minHeight, window.innerHeight - top - bottomGap));
    }
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [bottomGap, minHeight]);

  return (
    <div
      ref={ref}
      className={cn("overflow-y-auto", className)}
      style={{ maxHeight: maxH }}
    >
      {children}
    </div>
  );
}
