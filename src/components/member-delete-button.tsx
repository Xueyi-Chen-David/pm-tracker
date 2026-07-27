"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteWorkspaceMember } from "@/server/actions/team";
import { Button } from "@/components/ui/button";

export function MemberDeleteButton({
  id,
  name,
  mode = "icon",
  redirectTo,
}: {
  id: string;
  name: string;
  mode?: "icon" | "button";
  redirectTo?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (
      !confirm(
        `確定要把「${name}」從工作區刪除嗎？\n\n他在各專案的成員資格會被移除；他建立 / 負責的專案會轉由你接手。此動作無法復原。`,
      )
    )
      return;
    start(async () => {
      try {
        const res = await deleteWorkspaceMember(id);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(`已刪除成員 ${name}`);
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "刪除失敗");
      }
    });
  }

  if (mode === "button") {
    return (
      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={handleDelete}
      >
        <Trash2 className="h-4 w-4" /> 刪除成員
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title="刪除成員"
      disabled={pending}
      onClick={handleDelete}
      className="text-muted-foreground hover:text-destructive"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
