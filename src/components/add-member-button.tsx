"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { createWorkspaceMemberAction } from "@/server/actions/team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function AddMemberButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createWorkspaceMemberAction(null, fd);
      if (res?.ok) {
        setOpen(false);
        toast.success("已新增成員");
        router.refresh();
      } else {
        setError(res?.error ?? "新增失敗");
      }
    });
  }

  return (
    <>
      <Button onClick={() => { setError(null); setOpen(true); }}>
        <UserPlus className="h-4 w-4" /> 新增成員
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新增團隊成員</DialogTitle>
            <DialogDescription>
              用 Email 把人加入 workspace；之後可在專案中指派他、或建立個人 profile。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="m-name">真實姓名</Label>
                <Input id="m-name" name="name" required placeholder="例：井上" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-nickname">綽號（選填）</Label>
                <Input id="m-nickname" name="nickname" placeholder="暱稱" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-email">Email</Label>
              <Input
                id="m-email"
                name="email"
                type="email"
                required
                placeholder="name@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-job">職稱（選填）</Label>
              <Input id="m-job" name="jobTitle" placeholder="例：業務 / 工程 / PM" />
            </div>
            {error && (
              <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                取消
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "新增中…" : "新增"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
