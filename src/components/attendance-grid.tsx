"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Circle } from "lucide-react";
import { setAttendance } from "@/server/actions/attendance";
import { MEMBER_EVENT_TYPES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { displayInitial } from "@/lib/display";
import { MemberName } from "@/components/member-name";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type GridDay = {
  day: number;
  dateStr: string; // yyyy-mm-dd
  weekday: number; // 0=Sun … 6=Sat
  weekend: boolean;
  label: string; // 例：7/1（三）
};

// offsite=true 代表在外工作（出差 / 在家工作），以圈圈呈現，不計入出席/缺席統計。
// holiday=true 代表休假 / 放假（人工指定），既不算出席也不算缺席，以「休」呈現。
// leave=true 代表請假（特休 / 事假 / 病假…），既不算出席也不算缺席，以粉色「假」呈現。
type Mark = {
  present: boolean;
  reason: string | null;
  offsite: boolean;
  holiday: boolean;
  leave: boolean;
};

export type GridMember = {
  id: string;
  name: string | null;
  nickname: string | null;
  useNickname: boolean;
  email: string | null;
  image: string | null;
  isBoss: boolean;
  marks: Record<string, Mark>;
};

export type GridLeaveType = { id: string; name: string; color: string | null };

const WEEKDAY_LABEL = ["日", "一", "二", "三", "四", "五", "六"];

export function AttendanceGrid({
  members,
  days,
  viewerUserId,
  canManage,
  leaveTypes = [],
}: {
  members: GridMember[];
  days: GridDay[];
  /** 目前檢視者的 userId：非管理者只能編輯自己的列。 */
  viewerUserId: string;
  /** 管理者可編輯所有人；否則只有自己那列可編輯。 */
  canManage: boolean;
  /** 可選假別（請假時挑，決定薪資扣薪比例）。 */
  leaveTypes?: GridLeaveType[];
}) {
  // 每日在勤人數（頁尾）＝出席，含在外工作（出差 / 在家工作），依伺服器資料計算。
  const dayPresent = days.map(
    (d) => members.filter((m) => m.marks[d.dateStr]?.present === true).length,
  );

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="bg-card sticky left-0 z-20 min-w-40 border-b border-r px-3 py-2 text-left font-medium">
              成員
            </th>
            {days.map((d) => (
              <th
                key={d.dateStr}
                className={cn(
                  "w-9 border-b px-0 py-1 text-center font-normal",
                  d.weekend && "bg-muted/40",
                )}
              >
                <div className="text-muted-foreground text-[10px] leading-none">
                  {WEEKDAY_LABEL[d.weekday]}
                </div>
                <div className="text-xs leading-tight font-medium">{d.day}</div>
              </th>
            ))}
            <th className="bg-card border-b border-l px-2 py-2 text-center font-medium">
              統計
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            let present = 0;
            let absent = 0;
            for (const d of days) {
              const mk = m.marks[d.dateStr];
              if (mk?.holiday || mk?.leave) continue; // 休假 / 請假：不列入出席 / 缺席統計
              // 出差 / 在家工作（present=true）也算出席
              if (mk?.present === true) present++;
              // 週末預設放假，放假不列入缺席統計。
              else if (mk?.present === false && !d.weekend) absent++;
            }
            return (
              <tr key={m.id} className="hover:bg-muted/30">
                <td className="bg-card sticky left-0 z-10 min-w-40 border-b border-r px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-7 w-7 shrink-0">
                      {m.image && <AvatarImage src={m.image} alt="" />}
                      <AvatarFallback className="text-[10px]">
                        {displayInitial(m)}
                      </AvatarFallback>
                    </Avatar>
                    <MemberName u={m} className="min-w-0 text-sm" />
                  </div>
                </td>
                {days.map((d) => (
                  <td
                    key={d.dateStr}
                    className={cn(
                      "border-b p-0.5 text-center",
                      d.weekend && "bg-muted/30",
                    )}
                  >
                    <AttendanceCell
                      userId={m.id}
                      dateStr={d.dateStr}
                      label={d.label}
                      mark={m.marks[d.dateStr]}
                      editable={canManage || m.id === viewerUserId}
                      weekend={d.weekend}
                      leaveTypes={leaveTypes}
                    />
                  </td>
                ))}
                <td className="border-b border-l px-2 py-1.5 text-center whitespace-nowrap">
                  <span className="text-emerald-600">{present}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-rose-600">{absent}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-muted/40">
            <td className="bg-muted/40 sticky left-0 z-10 border-r px-3 py-1.5 text-xs font-medium">
              當日在勤
            </td>
            {days.map((d, i) => (
              <td
                key={d.dateStr}
                className="text-muted-foreground px-0 py-1.5 text-center text-[11px]"
              >
                {dayPresent[i] || ""}
              </td>
            ))}
            <td className="border-l" />
          </tr>
        </tfoot>
      </table>

      {/* 缺席原因建議清單（整個 grid 共用一份） */}
      <datalist id="att-reasons">
        {MEMBER_EVENT_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  );
}

/** 唯讀格：只顯示狀態圈叉，不可點（別人的列、且自己非管理者）。 */
function StaticCell({
  label,
  mark,
  weekend,
}: {
  label: string;
  mark?: Mark;
  weekend?: boolean;
}) {
  const isHoliday = mark?.holiday === true;
  const isLeave = !isHoliday && mark?.leave === true;
  const isOffsite = !isHoliday && !isLeave && mark?.offsite === true;
  const isPresent = !isHoliday && !isLeave && !isOffsite && mark?.present === true;
  const isAbsent = !isHoliday && !isLeave && !isOffsite && mark?.present === false;
  return (
    <div
      title={`${label}${isHoliday ? " · 休假" : isLeave ? " · 請假" : weekend && !mark ? " · 放假" : ""}${(isAbsent || isOffsite || isLeave) && mark?.reason ? ` · ${mark.reason}` : ""}`}
      className={cn(
        "mx-auto flex h-7 w-7 items-center justify-center rounded-md border text-xs",
        isPresent && "border-emerald-300 bg-emerald-100 text-emerald-700",
        isAbsent && "border-rose-300 bg-rose-100 text-rose-700",
        isOffsite && "rounded-full border-sky-400 bg-sky-100 text-sky-700",
        isHoliday && "border-slate-200 bg-slate-100 text-slate-500",
        isLeave && "border-pink-300 bg-pink-100 text-pink-700",
        !isPresent &&
          !isAbsent &&
          !isOffsite &&
          !isHoliday &&
          !isLeave &&
          "border-transparent",
      )}
    >
      {isHoliday ? (
        <span className="text-[10px] font-medium">休</span>
      ) : isLeave ? (
        <span className="text-[10px] font-medium">假</span>
      ) : isOffsite ? (
        <Circle className="h-3.5 w-3.5" />
      ) : isPresent ? (
        <Check className="h-4 w-4" />
      ) : isAbsent ? (
        <X className="h-4 w-4" />
      ) : weekend ? (
        <span className="text-muted-foreground/50 text-[10px]" aria-hidden>
          休
        </span>
      ) : (
        <span className="text-muted-foreground/30" aria-hidden>
          ·
        </span>
      )}
    </div>
  );
}

function AttendanceCell({
  userId,
  dateStr,
  label,
  mark,
  editable,
  weekend,
  leaveTypes = [],
}: {
  userId: string;
  dateStr: string;
  label: string;
  mark?: Mark;
  editable: boolean;
  /** 週末＝預設放假：格子顯示「休」、且不提供「缺席」（放假不算缺席）。 */
  weekend?: boolean;
  leaveTypes?: GridLeaveType[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [state, setState] = useState<Mark | null>(mark ?? null);
  const [reason, setReason] = useState(mark?.reason ?? "");

  if (!editable) return <StaticCell label={label} mark={mark} weekend={weekend} />;

  // status=offsite 時（出差 / 在家工作）用 offsiteReason 帶入類型文字。
  // status=leave 時可帶 leave={ id, name }：以假別名稱為事由，並記下 leaveTypeId 供薪資扣薪。
  function apply(
    status: "present" | "absent" | "offsite" | "holiday" | "leave" | "clear",
    opts?: { offsiteReason?: string; leave?: { id: string; name: string } },
  ) {
    const leaveReason = opts?.leave?.name ?? (status === "leave" ? reason : "");
    start(async () => {
      try {
        await setAttendance({
          userId,
          date: dateStr,
          status,
          reason:
            status === "absent"
              ? reason
              : status === "leave"
                ? leaveReason
                : status === "offsite"
                  ? opts?.offsiteReason
                  : undefined,
          leaveTypeId: status === "leave" ? opts?.leave?.id : undefined,
        });
        setState(
          status === "clear"
            ? null
            : {
                // 出席 / 在外工作算出席；缺席 / 休假 / 請假不算。
                present: status === "present" || status === "offsite",
                reason:
                  status === "absent"
                    ? reason.trim() || null
                    : status === "leave"
                      ? leaveReason.trim() || null
                      : status === "offsite"
                        ? (opts?.offsiteReason ?? null)
                        : null,
                offsite: status === "offsite",
                holiday: status === "holiday",
                leave: status === "leave",
              },
        );
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "更新失敗");
      }
    });
  }

  // 呈現優先序：休假 → 請假 → 在外工作（出差 / 在家工作）→ 出席 / 缺席。
  const isHoliday = state?.holiday === true;
  const isLeave = !isHoliday && state?.leave === true;
  const isOffsite = !isHoliday && !isLeave && state?.offsite === true;
  const isPresent = !isHoliday && !isLeave && !isOffsite && state?.present === true;
  const isAbsent = !isHoliday && !isLeave && !isOffsite && state?.present === false;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        title={`${label}${isHoliday ? " · 休假" : isLeave ? " · 請假" : weekend && !state ? " · 放假" : ""}${(isAbsent || isOffsite || isLeave) && state?.reason ? ` · ${state.reason}` : ""}`}
        className={cn(
          "mx-auto flex h-7 w-7 items-center justify-center rounded-md border text-xs transition-colors",
          isPresent && "border-emerald-300 bg-emerald-100 text-emerald-700",
          isAbsent && "border-rose-300 bg-rose-100 text-rose-700",
          isOffsite && "rounded-full border-sky-400 bg-sky-100 text-sky-700",
          isHoliday && "border-slate-200 bg-slate-100 text-slate-500",
          isLeave && "border-pink-300 bg-pink-100 text-pink-700",
          !isPresent &&
            !isAbsent &&
            !isOffsite &&
            !isHoliday &&
            !isLeave &&
            "text-muted-foreground/40 border-transparent hover:bg-muted",
          pending && "opacity-50",
        )}
      >
        {isHoliday ? (
          <span className="text-[10px] font-medium">休</span>
        ) : isLeave ? (
          <span className="text-[10px] font-medium">假</span>
        ) : isOffsite ? (
          <Circle className="h-3.5 w-3.5" />
        ) : isPresent ? (
          <Check className="h-4 w-4" />
        ) : isAbsent ? (
          <X className="h-4 w-4" />
        ) : weekend ? (
          <span className="text-muted-foreground/50 text-[10px]" aria-hidden>
            休
          </span>
        ) : (
          <span aria-hidden>·</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="center" className="w-56 gap-2">
        <div className="text-muted-foreground text-xs">
          {label}
          {weekend && " · 放假"}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => apply("present")}
            className="rounded-md border border-emerald-300 bg-emerald-50 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
          >
            出席
          </button>
          {/* 週末預設放假，不提供「缺席」——放假不算缺席。 */}
          {!weekend && (
            <button
              type="button"
              onClick={() => apply("absent")}
              className="rounded-md border border-rose-300 bg-rose-50 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
            >
              缺席
            </button>
          )}
          {/* 休假：人工把某天標為休（既不算出席也不算缺席）。週末已預設放假，不重複提供。 */}
          {!weekend && (
            <button
              type="button"
              onClick={() => apply("holiday")}
              className="rounded-md border border-slate-300 bg-slate-50 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              休假
            </button>
          )}
          {/* 沒有定義假別時：單一「請假」按鈕（事由填在下方）。有假別時改用下方假別清單。 */}
          {!weekend && leaveTypes.length === 0 && (
            <button
              type="button"
              onClick={() => apply("leave")}
              className="rounded-md border border-pink-300 bg-pink-50 py-1 text-xs font-medium text-pink-700 hover:bg-pink-100"
            >
              請假
            </button>
          )}
          <button
            type="button"
            onClick={() => apply("clear")}
            className="text-muted-foreground rounded-md border py-1 text-xs font-medium hover:bg-muted"
          >
            清除
          </button>
        </div>
        {/* 請假（挑假別）：假別的給付比例決定薪資扣薪。週末已放假，不提供。 */}
        {!weekend && leaveTypes.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-1 text-[11px]">請假（挑假別）</div>
            <div className="flex flex-wrap gap-1">
              {leaveTypes.map((lt) => (
                <button
                  key={lt.id}
                  type="button"
                  onClick={() => apply("leave", { leave: { id: lt.id, name: lt.name } })}
                  className="rounded-full border px-2 py-0.5 text-xs font-medium hover:opacity-80"
                  style={{
                    borderColor: lt.color ?? "#f9a8d4",
                    color: lt.color ?? "#be185d",
                  }}
                >
                  {lt.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => apply("offsite", { offsiteReason: "出差" })}
            className="rounded-md border border-sky-300 bg-sky-50 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100"
          >
            出差
          </button>
          <button
            type="button"
            onClick={() => apply("offsite", { offsiteReason: "在家工作" })}
            className="rounded-md border border-sky-300 bg-sky-50 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100"
          >
            在家工作
          </button>
        </div>
        {/* 缺席 / 請假事由：僅平日適用（缺席原因、或請假假別特休/事假/病假…）；週末放假不顯示。 */}
        {!weekend && (
          <input
            list="att-reasons"
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            placeholder="缺席 / 請假事由（選填）"
            className="h-8 w-full rounded-md border px-2 text-sm"
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
