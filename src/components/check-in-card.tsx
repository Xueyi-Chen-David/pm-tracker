"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { LogIn, LogOut, MapPin, Wifi } from "lucide-react";
import { punch } from "@/server/actions/checkin";
import type { CheckInMatchMode } from "@/lib/checkin";
import { Button } from "@/components/ui/button";

type Punch = {
  id: string;
  kind: string;
  at: string | Date;
  method: string | null;
};

/** 依通過方式顯示對應圖示與說明（both＝定位＋IP 皆符合）。 */
function MethodBadge({ method }: { method: string | null }) {
  if (!method) return null;
  if (method === "both") {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
        <MapPin className="h-3 w-3" />
        <Wifi className="h-3 w-3" />
        定位＋IP
      </span>
    );
  }
  const isGps = method === "gps";
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
      {isGps ? <MapPin className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
      {isGps ? "定位" : "IP"}
    </span>
  );
}

function getCoords(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null), // 拒絕 / 失敗 → 交由 IP 判斷
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

export function CheckInCard({
  todayPunches,
  matchMode = "any",
}: {
  todayPunches: Punch[];
  matchMode?: CheckInMatchMode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyKind, setBusyKind] = useState<"in" | "out" | null>(null);

  function doPunch(kind: "in" | "out") {
    setBusyKind(kind);
    start(async () => {
      try {
        const coords = await getCoords();
        const res = await punch({ kind, lat: coords?.lat ?? null, lng: coords?.lng ?? null });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(kind === "in" ? "已完成上班打卡" : "已完成下班打卡");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "打卡失敗");
      } finally {
        setBusyKind(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="h-11 gap-1.5"
          disabled={pending}
          onClick={() => doPunch("in")}
        >
          <LogIn className="h-4 w-4" />
          {busyKind === "in" ? "打卡中…" : "上班打卡"}
        </Button>
        <Button
          variant="outline"
          className="h-11 gap-1.5"
          disabled={pending}
          onClick={() => doPunch("out")}
        >
          <LogOut className="h-4 w-4" />
          {busyKind === "out" ? "打卡中…" : "下班打卡"}
        </Button>
      </div>

      {todayPunches.length === 0 ? (
        <p className="text-muted-foreground text-xs">今天還沒有打卡紀錄。</p>
      ) : (
        <ul className="space-y-1">
          {todayPunches.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 text-sm"
            >
              <span
                className={
                  p.kind === "in" ? "text-emerald-600" : "text-slate-500"
                }
              >
                {p.kind === "in" ? "上班" : "下班"}
              </span>
              <span className="tabular-nums">{format(new Date(p.at), "HH:mm")}</span>
              <MethodBadge method={p.method} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground text-[11px]">
        {matchMode === "all"
          ? "打卡需同時連上允許的公司網路（IP）並位於指定地點範圍內。"
          : "打卡需在允許的公司網路（IP）或指定地點範圍內。"}
        上班打卡會標記當日出席。
      </p>
    </div>
  );
}
