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
type Mark = { present: boolean; reason: string | null; offsite: boolean };

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

const WEEKDAY_LABEL = ["日", "一", "二", "三", "四", "五", "六"];

export function AttendanceGrid({
  members,
  days,
  viewerUserId,
  canManage,
}: {
  members: GridMember[];
  days: GridDay[];
  /** 目前檢視者的 userId：非管理者只能編輯自己的列。 */
  viewerUserId: string;
  /** 管理者可編輯所有人；否則只有自己那列可編輯。 */
  canManage: boolean;
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
              // 出差 / 在家工作（present=true）也算出席
              if (mk?.present === true) present++;
              else if (mk?.present === false) absent++;
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
function StaticCell({ label, mark }: { label: string; mark?: Mark }) {
  const isOffsite = mark?.offsite === true;
  const isPresent = !isOffsite && mark?.present === true;
  const isAbsent = !isOffsite && mark?.present === false;
  return (
    <div
      title={`${label}${(isAbsent || isOffsite) && mark?.reason ? ` · ${mark.reason}` : ""}`}
      className={cn(
        "mx-auto flex h-7 w-7 items-center justify-center rounded-md border text-xs",
        isPresent && "border-emerald-300 bg-emerald-100 text-emerald-700",
        isAbsent && "border-rose-300 bg-rose-100 text-rose-700",
        isOffsite && "rounded-full border-sky-400 bg-sky-100 text-sky-700",
        !isPresent && !isAbsent && !isOffsite && "border-transparent",
      )}
    >
      {isOffsite ? (
        <Circle className="h-3.5 w-3.5" />
      ) : isPresent ? (
        <Check className="h-4 w-4" />
      ) : isAbsent ? (
        <X className="h-4 w-4" />
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
}: {
  userId: string;
  dateStr: string;
  label: string;
  mark?: Mark;
  editable: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [state, setState] = useState<Mark | null>(mark ?? null);
  const [reason, setReason] = useState(mark?.reason ?? "");

  if (!editable) return <StaticCell label={label} mark={mark} />;

  // status=offsite 時（出差 / 在家工作）用 offsiteReason 帶入類型文字。
  function apply(
    status: "present" | "absent" | "offsite" | "clear",
    offsiteReason?: string,
  ) {
    start(async () => {
      try {
        await setAttendance({
          userId,
          date: dateStr,
          status,
          reason:
            status === "absent"
              ? reason
              : status === "offsite"
                ? offsiteReason
                : undefined,
        });
        setState(
          status === "clear"
            ? null
            : {
                present: status !== "absent", // 出差/在家工作也算出席
                reason:
                  status === "absent"
                    ? reason.trim() || null
                    : status === "offsite"
                      ? (offsiteReason ?? null)
                      : null,
                offsite: status === "offsite",
              },
        );
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "更新失敗");
      }
    });
  }

  // 在外工作（出差 / 在家工作）優先於一般出席呈現：圈圈、藍色。
  const isOffsite = state?.offsite === true;
  const isPresent = !isOffsite && state?.present === true;
  const isAbsent = !isOffsite && state?.present === false;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        title={`${label}${(isAbsent || isOffsite) && state?.reason ? ` · ${state.reason}` : ""}`}
        className={cn(
          "mx-auto flex h-7 w-7 items-center justify-center rounded-md border text-xs transition-colors",
          isPresent && "border-emerald-300 bg-emerald-100 text-emerald-700",
          isAbsent && "border-rose-300 bg-rose-100 text-rose-700",
          isOffsite && "rounded-full border-sky-400 bg-sky-100 text-sky-700",
          !isPresent &&
            !isAbsent &&
            !isOffsite &&
            "text-muted-foreground/40 border-transparent hover:bg-muted",
          pending && "opacity-50",
        )}
      >
        {isOffsite ? (
          <Circle className="h-3.5 w-3.5" />
        ) : isPresent ? (
          <Check className="h-4 w-4" />
        ) : isAbsent ? (
          <X className="h-4 w-4" />
        ) : (
          <span aria-hidden>·</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="center" className="w-56 gap-2">
        <div className="text-muted-foreground text-xs">{label}</div>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => apply("present")}
            className="rounded-md border border-emerald-300 bg-emerald-50 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
          >
            出席
          </button>
          <button
            type="button"
            onClick={() => apply("absent")}
            className="rounded-md border border-rose-300 bg-rose-50 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
          >
            缺席
          </button>
          <button
            type="button"
            onClick={() => apply("clear")}
            className="text-muted-foreground rounded-md border py-1 text-xs font-medium hover:bg-muted"
          >
            清除
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => apply("offsite", "出差")}
            className="rounded-md border border-sky-300 bg-sky-50 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100"
          >
            出差
          </button>
          <button
            type="button"
            onClick={() => apply("offsite", "在家工作")}
            className="rounded-md border border-sky-300 bg-sky-50 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100"
          >
            在家工作
          </button>
        </div>
        <input
          list="att-reasons"
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
          placeholder="缺席原因（選填）"
          className="h-8 w-full rounded-md border px-2 text-sm"
        />
      </PopoverContent>
    </Popover>
  );
}
