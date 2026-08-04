"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  deleteWorkspaceMember,
  getMemberProjectHandoffInfo,
} from "@/server/actions/team";
import { displayName } from "@/lib/display";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type HandoffMember = {
  userId: string;
  name: string | null;
  nickname: string | null;
  useNickname: boolean | null;
  email: string | null;
  jobTitle: string | null;
};

/**
 * 刪除成員：他在本組織建立 / 負責中的專案要轉給誰接手，改成請操作者當場指定
 * （見 team.ts 的 getMemberProjectHandoffInfo / deleteWorkspaceMember），不再悄悄
 * 轉給按下刪除的人。點擊時先查有沒有專案要交接，有才顯示接手人選單。
 */
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
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [ownedCount, setOwnedCount] = useState(0);
  const [others, setOthers] = useState<HandoffMember[]>([]);
  const [reassignTo, setReassignTo] = useState("");

  async function openDialog(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      const info = await getMemberProjectHandoffInfo(id);
      setOwnedCount(info.ownedCount);
      setOthers(info.others);
      setReassignTo("");
      setOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "讀取資料失敗");
    } finally {
      setLoading(false);
    }
  }

  function confirmDelete() {
    if (ownedCount > 0 && !reassignTo) {
      toast.error("請先選擇要把專案轉給誰接手");
      return;
    }
    start(async () => {
      try {
        const res = await deleteWorkspaceMember(id, reassignTo || undefined);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(`已刪除成員 ${name}`);
        setOpen(false);
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "刪除失敗");
      }
    });
  }

  return (
    <>
      {mode === "button" ? (
        <Button variant="destructive" size="sm" disabled={loading} onClick={openDialog}>
          <Trash2 className="h-4 w-4" /> 刪除成員
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          title="刪除成員"
          disabled={loading}
          onClick={openDialog}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>刪除成員「{name}」</DialogTitle>
            <DialogDescription>
              他在各專案的成員資格會被移除，出席 / 事件紀錄一併清除。此動作無法復原。
            </DialogDescription>
          </DialogHeader>

          {ownedCount > 0 ? (
            <div className="space-y-1.5">
              <p className="text-sm">
                他在本組織建立 / 負責 <span className="font-medium">{ownedCount}</span>{" "}
                個專案，請指定要轉給誰接手：
              </p>
              <select
                className="border-input bg-transparent h-9 w-full rounded-md border px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                value={reassignTo}
                disabled={pending}
                onChange={(e) => setReassignTo(e.target.value)}
              >
                <option value="">請選擇接手的人…</option>
                {others.map((o) => (
                  <option key={o.userId} value={o.userId}>
                    {displayName(o)}
                    {o.jobTitle ? `（${o.jobTitle}）` : ""}
                  </option>
                ))}
              </select>
              {others.length === 0 && (
                <p className="text-destructive text-xs">
                  找不到其他在職成員可接手，請先確保組織裡還有別人在職。
                </p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">他目前沒有建立 / 負責中的專案。</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={pending || (ownedCount > 0 && !reassignTo)}
            >
              確認刪除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
