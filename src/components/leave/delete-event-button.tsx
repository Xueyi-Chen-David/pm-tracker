"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteMemberEvent } from "@/server/actions/member-events";
import { Button } from "@/components/ui/button";

/** 刪除一筆事件（出差 / 在家工作 / 外出…）；自己的事件可刪，代他人登記者也可刪對方的。 */
export function DeleteEventButton({
  id,
  userId,
  label,
}: {
  id: string;
  userId: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title="刪除"
      disabled={pending}
      onClick={() => {
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
      }}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
