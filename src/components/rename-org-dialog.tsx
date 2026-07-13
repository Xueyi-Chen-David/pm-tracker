"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { renameOrganizationAction } from "@/server/actions/organizations";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RenameOrgDialog({
  orgId,
  currentName,
}: {
  orgId: string;
  currentName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function openDialog() {
    setName(currentName);
    setError(null);
    setOpen(true);
  }

  function save() {
    const next = name.trim();
    if (!next || next === currentName) return;
    setError(null);
    start(async () => {
      const res = await renameOrganizationAction(orgId, next);
      if (res?.error) {
        setError(res.error);
        return;
      }
      toast.success("已更新組織名稱");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        title="重新命名組織"
        aria-label="重新命名組織"
        onClick={openDialog}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>重新命名組織</DialogTitle>
            <DialogDescription>變更會套用到所有成員看到的組織名稱。</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="rename-org-name">組織名稱</Label>
            <Input
              id="rename-org-name"
              value={name}
              maxLength={100}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
            />
          </div>
          {error && (
            <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={save}
              disabled={pending || !name.trim() || name.trim() === currentName}
            >
              {pending ? "儲存中…" : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
