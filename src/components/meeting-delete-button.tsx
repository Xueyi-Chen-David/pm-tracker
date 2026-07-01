"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteMeeting } from "@/server/actions/meetings";
import { Button } from "@/components/ui/button";

export function MeetingDeleteButton({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title="刪除會議"
      disabled={pending}
      className="text-muted-foreground hover:text-destructive"
      onClick={() => {
        if (!confirm(`確定刪除會議「${title}」嗎？此動作無法復原。`)) return;
        start(async () => {
          try {
            await deleteMeeting(id);
            toast.success("已刪除會議");
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
