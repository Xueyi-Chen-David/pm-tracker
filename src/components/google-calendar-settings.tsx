"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Copy, RefreshCw } from "lucide-react";
import { setGoogleCalendarId } from "@/server/actions/org-settings";
import { backfillCalendarSync } from "@/server/actions/calendar-sync";
import { cn } from "@/lib/utils";
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

export function GoogleCalendarSettings({
  calendarId: initialCalendarId,
  serviceAccountConfigured,
  serviceAccountEmail,
}: {
  calendarId: string | null;
  /** 服務帳戶 env（GOOGLE_CALENDAR_CLIENT_EMAIL / _PRIVATE_KEY）是否已設定——沒設定時
   *  就算貼了日曆 ID 也不會真的同步，先把話講清楚，不要讓管理者以為設完就會動。 */
  serviceAccountConfigured: boolean;
  serviceAccountEmail: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  // 手動補同步跟儲存日曆 ID 用各自的 pending，避免儲存中把補同步按鈕也一起鎖住（反之亦然）。
  const [backfilling, startBackfill] = useTransition();
  const [calendarId, setCalendarId] = useState(initialCalendarId ?? "");

  function copyEmail() {
    if (!serviceAccountEmail) return;
    navigator.clipboard
      .writeText(serviceAccountEmail)
      .then(() => toast.success("已複製服務帳戶 Email"))
      .catch(() => toast.error("複製失敗，請手動選取複製"));
  }

  function save() {
    start(async () => {
      try {
        await setGoogleCalendarId(calendarId);
        toast.success(calendarId.trim() ? "已啟用 Google 日曆同步" : "已關閉 Google 日曆同步");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "儲存失敗");
      }
    });
  }

  function backfill() {
    startBackfill(async () => {
      try {
        const res = await backfillCalendarSync();
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        if (res.total === 0) {
          toast.success("沒有需要補同步的歷史紀錄");
        } else if (res.failed > 0) {
          toast.warning(`已同步 ${res.synced} / ${res.total} 筆，${res.failed} 筆失敗（詳見伺服器記錄）`);
        } else {
          toast.success(`已同步 ${res.synced} 筆歷史請假 / 出差紀錄`);
        }
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "同步失敗");
      }
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
        title="Google 日曆同步"
      >
        <CalendarClock className="h-4 w-4" />
        <span className="hidden sm:inline">Google 日曆同步</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* max-h + overflow-y-auto 已經是 DialogContent 的預設值（見 ui/dialog.tsx 註解），
            這裡加寬到 lg 純粹是內容本身偏長（服務帳戶信箱、日曆 ID 提示都是長字串），
            sm:max-w-md 太窄逼得裡面的字擠得緊，容易看起來像被裁切。 */}
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Google 日曆同步</DialogTitle>
            <DialogDescription>
              請假、出差核准後自動在指定日曆寫一筆全天事件；駁回 / 待簽核不會出現。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!serviceAccountConfigured ? (
              <p className="bg-amber-50 text-amber-900 rounded-md px-3 py-2 text-xs break-words dark:bg-amber-950/40 dark:text-amber-100">
                系統尚未設定 Google 服務帳戶（環境變數
                GOOGLE_CALENDAR_CLIENT_EMAIL / GOOGLE_CALENDAR_PRIVATE_KEY），
                這裡填了日曆 ID 也不會真的同步，請先洽系統管理員設定。
              </p>
            ) : (
              // break-words：GOOGLE_CALENDAR_CLIENT_EMAIL 這類沒有空白的長字串，瀏覽器預設
              // 不會在字中間換行，字比容器寬就會整段被推出去、對話框看起來像被裁切，要顯式允許斷字。
              <div className="bg-muted/40 space-y-1.5 rounded-md px-3 py-2 text-xs break-words">
                <p className="font-medium">設定步驟：</p>
                <ol className="list-decimal space-y-1 pl-4">
                  <li>
                    到要同步進去的 Google 日曆「設定與共用」，把下面這個信箱加為
                    「進行變更」（Make changes to events）的共用對象：
                  </li>
                </ol>
                <div className="flex items-center gap-1.5">
                  {/* min-w-0 是關鍵：flex 子項預設不會縮到比內容本身還窄（min-width: auto），
                      服務帳戶信箱很長，沒有這個 truncate 不會生效，會把整個對話框撐寬、
                      要左右捲動才看得完。跟 MultiSelectField 的觸發鈕同一個修法。 */}
                  <code className="bg-background min-w-0 flex-1 truncate rounded border px-2 py-1">
                    {serviceAccountEmail}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={copyEmail}
                    title="複製"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <ol start={2} className="list-decimal space-y-1 pl-4">
                  <li>
                    在該日曆的「整合日曆」找到「日曆 ID」（通常是一串 Email 或
                    xxx@group.calendar.google.com），貼到下面。
                  </li>
                </ol>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="gc-id">日曆 ID</Label>
              <Input
                id="gc-id"
                value={calendarId}
                onChange={(e) => setCalendarId(e.target.value)}
                placeholder="留空＝不同步"
                className="font-mono"
              />
              <p className="text-muted-foreground text-xs">
                留空即可隨時關閉同步，不影響既有的請假 / 出差紀錄。
              </p>
            </div>

            {/* 只在「已儲存」的日曆 ID 存在時才顯示——這顆按鈕是照資料庫現在存的日曆 ID
                去補同步，不是照上面輸入框裡還沒存檔的值，避免使用者誤會兩者是同一件事。 */}
            {initialCalendarId && (
              <div className="space-y-1.5 border-t pt-3.5">
                <Label>手動補同步</Label>
                <p className="text-muted-foreground text-xs">
                  新核准的請假 / 出差已經會自動同步；這顆按鈕是把設定日曆 ID
                  之前、原本就已核准的舊紀錄一次補進日曆。可重複按，不會建立重複事件。
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={backfill}
                  disabled={backfilling}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", backfilling && "animate-spin")} />
                  {backfilling ? "同步中…" : "同步歷史請假 / 出差紀錄"}
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? "儲存中…" : "儲存設定"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
