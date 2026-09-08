"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createMemberEvent } from "@/server/actions/member-events";
import { MEMBER_EVENT_TYPES } from "@/lib/constants";
import { toDateInput } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  AttachmentField,
  type AttachmentValue,
} from "@/components/attachment-field";
import { inputCls, DateField } from "@/components/leave/form-field";

/**
 * 出差 / 事件的新增表單（免簽核，送出即登記，即時反映到出席月曆）。
 * userId＝登記給誰——自己或（有出勤管理權限時）代他人登記，由呼叫端決定。
 * 與事件清單（member-event-row.tsx）共用同一份資料模型，本元件只管新增。
 *
 * 版面刻意比照 LeaveRequestForm 內部欄位樣式（Label + 對齊的 grid），不是另一套風格；
 * 兩個表單並排在同一頁，樣式不一致反而更顯眼。
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
        toast.success(
          res.autoApproved ? "已登記" : "已送出，等待簽核",
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "登記失敗");
      }
    });
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>登記出差 / 事件</CardTitle>
        <CardDescription>
          出差會即時反映到出席月曆；外出、其他等不影響出勤紀錄。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="qe-type">類型</Label>
            <input
              id="qe-type"
              list="member-event-types"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="例：出差"
              className={inputCls}
            />
            <datalist id="member-event-types">
              {types.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <DateField id="qe-start" label="起" value={startDate} onChange={setStartDate} />
          <DateField
            id="qe-end"
            label="迄（選填）"
            value={endDate}
            min={startDate}
            onChange={setEndDate}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="qe-note">備註（選填）</Label>
          <Input
            id="qe-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例：家庭事由 / 客戶拜訪地點"
          />
        </div>
        <AttachmentField
          value={attachment}
          onChange={setAttachment}
          label="證明附件（選填，如出差單 / 診斷證明）"
        />
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          size="sm"
          disabled={!type.trim() || !startDate || pending}
          onClick={add}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" /> 登記
        </Button>
      </CardFooter>
    </Card>
  );
}
