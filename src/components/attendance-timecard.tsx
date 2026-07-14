"use client";

import { format } from "date-fns";
import { LogIn, LogOut, MapPin, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

export type TimecardDay = {
  day: number;
  dateStr: string; // yyyy-MM-dd
  weekday: number; // 0=日 … 6=六
  weekend: boolean;
  inAt: string | null; // 當日最早「上班」時間（ISO）
  outAt: string | null; // 當日最晚「下班」時間（ISO）
  inMethod: string | null;
  outMethod: string | null;
};

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

function fmtTime(iso: string | null): string {
  return iso ? format(new Date(iso), "HH:mm") : "—";
}

/** 在勤時段（最早上班 → 最晚下班的跨度）。 */
function spanLabel(inAt: string | null, outAt: string | null): string {
  if (!inAt || !outAt) return "—";
  const ms = new Date(outAt).getTime() - new Date(inAt).getTime();
  if (ms <= 0) return "—";
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} 小時 ${m} 分` : `${h} 小時`;
}

function MethodIcon({ method }: { method: string | null }) {
  if (!method) return null;
  return (
    <span className="text-muted-foreground/70" title={method === "gps" ? "定位" : "IP"}>
      {method === "gps" ? (
        <MapPin className="h-3 w-3" />
      ) : (
        <Wifi className="h-3 w-3" />
      )}
    </span>
  );
}

/**
 * 個人「打卡紙」：以類似實體打卡卡的表格，逐日列出自己上/下班打卡時間與在勤時段。
 * 時間一律以瀏覽器本地時區呈現（打卡當下的時間）。
 */
export function AttendanceTimecard({
  days,
  todayStr,
}: {
  days: TimecardDay[];
  todayStr: string;
}) {
  const workedDays = days.filter((d) => d.inAt || d.outAt).length;
  const totalMins = days.reduce((s, d) => {
    if (d.inAt && d.outAt) {
      const ms = new Date(d.outAt).getTime() - new Date(d.inAt).getTime();
      if (ms > 0) return s + ms / 60000;
    }
    return s;
  }, 0);
  const totalH = Math.floor(totalMins / 60);
  const totalM = Math.round(totalMins % 60);

  return (
    <section className="bg-card overflow-hidden rounded-xl border shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-base font-semibold">我的打卡紀錄</h2>
        <div className="text-muted-foreground text-xs">
          出勤 {workedDays} 天 · 總在勤 {totalH} 小時
          {totalM > 0 ? ` ${totalM} 分` : ""}
        </div>
      </div>

      {days.length === 0 ? (
        <p className="text-muted-foreground px-4 py-8 text-center text-sm">
          本月尚無打卡紀錄。到「每日報告」頁即可上/下班打卡。
        </p>
      ) : (
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="bg-muted/40 text-muted-foreground sticky top-0 text-[11px]">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">日期</th>
                <th className="px-3 py-1.5 text-left font-medium">上班</th>
                <th className="px-3 py-1.5 text-left font-medium">下班</th>
                <th className="px-3 py-1.5 text-left font-medium">在勤</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {days.map((d) => {
                const isToday = d.dateStr === todayStr;
                return (
                  <tr
                    key={d.dateStr}
                    className={cn(
                      d.weekend && "bg-muted/20",
                      isToday && "bg-primary/5",
                    )}
                  >
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <span
                        className={cn(
                          "tabular-nums",
                          d.weekend && "text-muted-foreground",
                        )}
                      >
                        {d.day} 日（{WEEKDAY[d.weekday]}）
                      </span>
                      {isToday && (
                        <span className="text-primary ml-1.5 text-[10px] font-medium">
                          今天
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {d.inAt ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <LogIn className="h-3 w-3 shrink-0" />
                          <span className="tabular-nums">{fmtTime(d.inAt)}</span>
                          <MethodIcon method={d.inMethod} />
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {d.outAt ? (
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <LogOut className="h-3 w-3 shrink-0" />
                          <span className="tabular-nums">{fmtTime(d.outAt)}</span>
                          <MethodIcon method={d.outMethod} />
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="text-muted-foreground px-3 py-1.5 whitespace-nowrap tabular-nums">
                      {spanLabel(d.inAt, d.outAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
