"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createMemberEvent } from "@/server/actions/member-events";
import { MEMBER_EVENT_TYPES } from "@/lib/constants";
import { toDateInput } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AttachmentField,
  type AttachmentValue,
} from "@/components/attachment-field";

const inputCls =
  "border-input bg-transparent dark:bg-input/30 h-9 rounded-md border px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

/**
 * 出差 / 事件的新增表單（免簽核，送出即登記，即時反映到出席月曆）。
 * userId＝登記給誰——自己或（有出勤管理權限時）代他人登記，由呼叫端決定。
 * 與事件清單（member-event-row.tsx）共用同一份資料模型，本元件只管新增。
 */
export function QuickEventForm({
  userId,
  types = MEMBER_EVENT_TYPES,
}: {
  userId: string;
  /** 可登記的類型建議清單（datalist）；「請假 / 出差」主時間軸情境會排除請假。 */
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
        toast.success("已登記");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "登記失敗");
      }
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
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
          <Plus className="h-4 w-4" /> 登記
        </Button>
      </div>
      <AttachmentField
        value={attachment}
        onChange={setAttachment}
        label="證明附件（選填，如出差單 / 診斷證明）"
      />
    </div>
  );
}
