"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { Check, LogIn, LogOut, MapPin, Wifi } from "lucide-react";
import { punch } from "@/server/actions/checkin";
import type { CheckInMatchMode } from "@/lib/checkin";
import { getCoords } from "@/lib/geo";
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

  // 每天每種卡只打一次：已打過的那顆直接顯示打卡時間並停用（伺服器端也會擋，
  // 這裡只是讓使用者不用按下去才知道）。要改時間走「補打卡」。
  const punchedIn = todayPunches.find((p) => p.kind === "in");
  const punchedOut = todayPunches.find((p) => p.kind === "out");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="h-11 gap-1.5"
          disabled={pending || !!punchedIn}
          title={punchedIn ? "今天已打過上班卡，如需更正請用補打卡" : undefined}
          onClick={() => doPunch("in")}
        >
          {punchedIn ? (
            <Check className="h-4 w-4 text-emerald-600" />
          ) : (
            <LogIn className="h-4 w-4" />
          )}
          {busyKind === "in"
            ? "打卡中…"
            : punchedIn
              ? `已上班打卡 ${format(new Date(punchedIn.at), "HH:mm")}`
              : "上班打卡"}
        </Button>
        <Button
          variant="outline"
          className="h-11 gap-1.5"
          disabled={pending || !!punchedOut}
          title={punchedOut ? "今天已打過下班卡，如需更正請用補打卡" : undefined}
          onClick={() => doPunch("out")}
        >
          {punchedOut ? (
            <Check className="h-4 w-4 text-emerald-600" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          {busyKind === "out"
            ? "打卡中…"
            : punchedOut
              ? `已下班打卡 ${format(new Date(punchedOut.at), "HH:mm")}`
              : "下班打卡"}
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
