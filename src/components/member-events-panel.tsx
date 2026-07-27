"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, CalendarRange } from "lucide-react";
import {
  createMemberEvent,
  deleteMemberEvent,
} from "@/server/actions/member-events";
import { MEMBER_EVENT_TYPES, memberEventBadge } from "@/lib/constants";
import { fmtDate, toDateInput } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AttachmentField,
  AttachmentLink,
  type AttachmentValue,
} from "@/components/attachment-field";

type EventItem = {
  id: string;
  type: string;
  startDate: Date | string;
  endDate: Date | string | null;
  note: string | null;
  attachment?: string | null;
  attachmentName?: string | null;
};

const inputCls =
  "border-input bg-transparent dark:bg-input/30 h-9 rounded-md border px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

export function MemberEventsPanel({
  userId,
  events,
  types = MEMBER_EVENT_TYPES,
}: {
  userId: string;
  events: EventItem[];
  /** 可登記的事件類型建議清單（預設全部；「出差 / 事件」情境會排除請假）。 */
  types?: readonly string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [type, setType] = useState("");
  const [startDate, setStartDate] = useState(toDateInput(new Date()));
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");
  const [attachment, setAttachment] = useState<AttachmentValue>(null);

  function add() {
    if (!type.trim() || !startDate) return;
    start(async () => {
      try {
        const res = await createMemberEvent({
          userId,
          type: type.trim(),
          startDate,
          endDate: endDate || undefined,
          note: note || undefined,
          attachment: attachment?.dataUrl,
          attachmentName: attachment?.name,
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setType("");
        setEndDate("");
        setNote("");
        setStartDate(toDateInput(new Date()));
        setAttachment(null);
        toast.success("已新增事件");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "新增失敗");
      }
    });
  }

  function remove(id: string, label: string) {
    if (!confirm(`確定刪除「${label}」這筆事件嗎？`)) return;
    start(async () => {
      try {
        const res = await deleteMemberEvent({ id, userId });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("已刪除");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "刪除失敗");
      }
    });
  }

  return (
    <div className="space-y-3">
      <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
        {events.map((ev) => (
          <li
            key={ev.id}
            className="hover:bg-muted/40 flex items-center gap-2 rounded-lg px-1.5 py-1.5"
          >
            <span
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
                memberEventBadge(ev.type),
              )}
            >
              {ev.type}
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <span className="text-muted-foreground inline-flex items-center gap-1">
                <CalendarRange className="h-3.5 w-3.5 shrink-0" />
                {fmtDate(ev.startDate)}
                {ev.endDate ? ` – ${fmtDate(ev.endDate)}` : ""}
              </span>
              {ev.note && (
                <span className="ml-2 whitespace-pre-wrap">{ev.note}</span>
              )}
              {ev.attachment && (
                <AttachmentLink
                  attachment={ev.attachment}
                  name={ev.attachmentName}
                  className="ml-2"
                />
              )}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              title="刪除"
              disabled={pending}
              onClick={() => remove(ev.id, `${ev.type} ${fmtDate(ev.startDate)}`)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
        {events.length === 0 && (
          <li className="text-muted-foreground py-2 text-sm">尚無事件紀錄</li>
        )}
      </ul>

      <div className="space-y-2 border-t pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            list="member-event-types"
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="類型（例：出差）"
            className={cn(inputCls, "w-28")}
          />
          <datalist id="member-event-types">
            {types.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <label className="text-muted-foreground flex items-center gap-1 text-xs">
            起
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="text-muted-foreground flex items-center gap-1 text-xs">
            迄
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputCls}
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="備註（選填，例：家庭事由 / 客戶拜訪地點）"
            className="h-9 flex-1"
          />
          <Button
            size="sm"
            disabled={!type.trim() || !startDate || pending}
            onClick={add}
          >
            <Plus className="h-4 w-4" /> 新增
          </Button>
        </div>
        <AttachmentField
          value={attachment}
          onChange={setAttachment}
          label="證明附件（選填，如出差單 / 診斷證明）"
        />
      </div>
    </div>
  );
}
