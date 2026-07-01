"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import {
  setProjectArchived,
  deleteProject,
} from "@/server/actions/projects";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ProjectActions({
  projectId,
  archived,
  canEdit,
}: {
  projectId: string;
  archived: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (!canEdit) return null;

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/projects/${projectId}/edit`}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        <Pencil className="h-4 w-4" /> 編輯
      </Link>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await setProjectArchived(projectId, !archived);
            toast.success(archived ? "已取消封存" : "已封存");
            router.refresh();
          })
        }
      >
        {archived ? (
          <>
            <ArchiveRestore className="h-4 w-4" /> 取消封存
          </>
        ) : (
          <>
            <Archive className="h-4 w-4" /> 封存
          </>
        )}
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!confirm("確定要刪除這個專案嗎？所有週報與里程碑都會一併刪除，且無法復原。"))
            return;
          start(async () => {
            await deleteProject(projectId);
          });
        }}
      >
        <Trash2 className="h-4 w-4" /> 刪除
      </Button>
    </div>
  );
}
