"use client";

import {
  cloneElement,
  isValidElement,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  createContact,
  updateContact,
  deleteContact,
} from "@/server/actions/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { OwnerLite } from "@/components/okr/key-result-row";

export type ContactView = {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  note: string | null;
  ownerId: string | null;
};

export function ContactDialog({
  trigger,
  members,
  contact,
}: {
  trigger: React.ReactElement;
  members: OwnerLite[];
  contact?: ContactView;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const editing = !!contact;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input = {
      name: String(fd.get("name") ?? "").trim(),
      company: String(fd.get("company") ?? "").trim() || undefined,
      title: String(fd.get("title") ?? "").trim() || undefined,
      email: String(fd.get("email") ?? "").trim() || undefined,
      phone: String(fd.get("phone") ?? "").trim() || undefined,
      note: String(fd.get("note") ?? "").trim() || undefined,
      ownerId: String(fd.get("ownerId") ?? "") || undefined,
    };
    if (!input.name) return setError("請輸入名稱");
    start(async () => {
      try {
        if (editing) {
          const res = await updateContact(contact.id, input);
          if (!res.ok) return setError(res.error);
        } else {
          await createContact(input);
        }
        setOpen(false);
        toast.success(editing ? "已更新聯絡人" : "已新增聯絡人");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "儲存失敗");
      }
    });
  }

  return (
    <>
      {isValidElement(trigger)
        ? cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, {
            onClick: () => {
              setError(null);
              setOpen(true);
            },
          })
        : trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "編輯聯絡人" : "新增聯絡人"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-name">姓名</Label>
                <Input id="c-name" name="name" required defaultValue={contact?.name ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-company">公司</Label>
                <Input
                  id="c-company"
                  name="company"
                  defaultValue={contact?.company ?? ""}
                  placeholder="例：井上酒造"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-title">職稱</Label>
                <Input id="c-title" name="title" defaultValue={contact?.title ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-owner">負責人</Label>
                <select
                  id="c-owner"
                  name="ownerId"
                  defaultValue={contact?.ownerId ?? ""}
                  className="border-input h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                >
                  <option value="">—</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-email">Email</Label>
                <Input id="c-email" name="email" type="email" defaultValue={contact?.email ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-phone">電話</Label>
                <Input id="c-phone" name="phone" defaultValue={contact?.phone ?? ""} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-note">備註</Label>
              <Textarea id="c-note" name="note" rows={2} defaultValue={contact?.note ?? ""} />
            </div>

            {error && (
              <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
                {error}
              </p>
            )}

            <DialogFooter className="gap-2">
              {editing && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`刪除聯絡人「${contact.name}」？（其商機的關聯會清空）`))
                      start(async () => {
                        try {
                          await deleteContact(contact.id);
                          setOpen(false);
                          toast.success("已刪除聯絡人");
                          router.refresh();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "刪除失敗");
                        }
                      });
                  }}
                  className="text-destructive hover:bg-destructive/10 mr-auto inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm"
                >
                  <Trash2 className="h-4 w-4" /> 刪除
                </button>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                取消
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "儲存中…" : editing ? "儲存" : "新增"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
