"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
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
  getContactCard,
} from "@/server/actions/crm";
import type { BusinessCardFields } from "@/server/gemini";
import { BusinessCardUploader } from "@/components/crm/business-card-uploader";
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
  aiEnabled = false,
}: {
  trigger: React.ReactElement;
  members: OwnerLite[];
  contact?: ContactView;
  aiEnabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [cardImage, setCardImage] = useState<string | null>(null);
  const editing = !!contact;

  const nameRef = useRef<HTMLInputElement>(null);
  const companyRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  // 開啟編輯時，個別把名片圖片撈回來（列表查詢刻意不含這個大欄位）。
  // 新增時不用重置 cardImage——trigger 的 onClick 已經在打開前同步清過了。
  useEffect(() => {
    if (open && contact) {
      getContactCard(contact.id)
        .then(setCardImage)
        .catch(() => setCardImage(null));
    }
  }, [open, contact]);

  // OCR 回填：換照片或按「重新辨識」都是使用者主動觸發的，直接覆蓋——
  // 之前寫成「只填空欄位」，換第二張照片時欄位已經有值，看起來就像按了沒反應。
  function applyExtracted(fields: BusinessCardFields) {
    const fill = (ref: React.RefObject<HTMLInputElement | null>, v: string | null) => {
      if (v && ref.current) ref.current.value = v;
    };
    fill(nameRef, fields.name);
    fill(companyRef, fields.company);
    fill(titleRef, fields.title);
    fill(emailRef, fields.email);
    fill(phoneRef, fields.phone);
  }

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
      businessCardImage: cardImage,
    };
    if (!input.name) return setError("請輸入名稱");
    start(async () => {
      try {
        const res = editing
          ? await updateContact(contact.id, input)
          : await createContact(input);
        if (!res.ok) return setError(res.error);
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
              setCardImage(null);
              setOpen(true);
            },
          })
        : trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "編輯聯絡人" : "新增聯絡人"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="space-y-1.5 sm:w-80 sm:shrink-0">
                <Label>名片</Label>
                <BusinessCardUploader
                  image={cardImage}
                  onImageChange={setCardImage}
                  aiEnabled={aiEnabled}
                  onExtracted={applyExtracted}
                />
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="c-name">姓名</Label>
                    <Input
                      id="c-name"
                      name="name"
                      required
                      ref={nameRef}
                      defaultValue={contact?.name ?? ""}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="c-company">公司</Label>
                    <Input
                      id="c-company"
                      name="company"
                      ref={companyRef}
                      defaultValue={contact?.company ?? ""}
                      placeholder="例：井上酒造"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="c-title">職稱</Label>
                    <Input
                      id="c-title"
                      name="title"
                      ref={titleRef}
                      defaultValue={contact?.title ?? ""}
                    />
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
                    <Input
                      id="c-email"
                      name="email"
                      type="email"
                      ref={emailRef}
                      defaultValue={contact?.email ?? ""}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="c-phone">電話</Label>
                    <Input
                      id="c-phone"
                      name="phone"
                      ref={phoneRef}
                      defaultValue={contact?.phone ?? ""}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-note">備註</Label>
                  <Textarea
                    id="c-note"
                    name="note"
                    rows={2}
                    defaultValue={contact?.note ?? ""}
                  />
                </div>
              </div>
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
