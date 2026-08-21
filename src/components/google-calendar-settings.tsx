"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Copy, RefreshCw, ChevronDown } from "lucide-react";
import { setGoogleCalendarId } from "@/server/actions/org-settings";
import {
  backfillCalendarSync,
  setGoogleCalendarServiceAccount,
} from "@/server/actions/calendar-sync";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type EffectiveServiceAccount = { email: string; source: "org" | "default" } | null;

export function GoogleCalendarSettings({
  calendarId: initialCalendarId,
  orgServiceAccountEmail,
  effectiveServiceAccount,
}: {
  calendarId: string | null;
  /** 這個組織自己設定的服務帳戶信箱（若有）——只是拿來預填「進階設定」表單。 */
  orgServiceAccountEmail: string | null;
  /** 實際會用哪個服務帳戶：組織自訂優先，否則系統預設；兩者都沒有就是 null。 */
  effectiveServiceAccount: EffectiveServiceAccount;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  // 手動補同步 / 服務帳戶設定 / 日曆 ID 各自獨立的 pending，避免其中一個在跑，
  // 把其他不相干的按鈕也一起鎖住。
  const [backfilling, startBackfill] = useTransition();
  const [savingAccount, startSaveAccount] = useTransition();
  const [calendarId, setCalendarId] = useState(initialCalendarId ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [clientEmail, setClientEmail] = useState(orgServiceAccountEmail ?? "");
  const [privateKey, setPrivateKey] = useState("");

  function copyEmail(email: string) {
    navigator.clipboard
      .writeText(email)
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

  function saveServiceAccount() {
    startSaveAccount(async () => {
      try {
        const res = await setGoogleCalendarServiceAccount({ clientEmail, privateKey });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(clientEmail ? "已設定自訂服務帳戶" : "已清除，改用系統預設服務帳戶");
        setPrivateKey(""); // 私鑰不回顯，存完清空輸入框
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "儲存失敗");
      }
    });
  }

  function clearServiceAccount() {
    setClientEmail("");
    setPrivateKey("");
    startSaveAccount(async () => {
      try {
        const res = await setGoogleCalendarServiceAccount({ clientEmail: "", privateKey: "" });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("已清除自訂服務帳戶，改用系統預設");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "清除失敗");
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

          {/* min-w-0 是真正的根因：DialogContent 是 display:grid，這個 div 是它的直接
              grid item，預設 min-width:auto 會讓 grid 欄寬去遷就子孫裡最寬的「內在內容」，
              把整個 grid track 撐寬到超過 max-w-lg，害 header/footer 也一起被撐寬。 */}
          <div className="min-w-0 space-y-4">
            {!effectiveServiceAccount ? (
              <p className="bg-amber-50 text-amber-900 rounded-md px-3 py-2 text-xs break-words dark:bg-amber-950/40 dark:text-amber-100">
                目前沒有可用的 Google 服務帳戶（系統未設定預設服務帳戶，這個組織也還沒有
                自訂憑證），這裡填了日曆 ID 也不會真的同步。可以在下面「進階：自訂服務帳戶」
                自己設定一組，或洽系統管理員設定系統預設。
              </p>
            ) : (
              // break-words：長字串（Email、日曆 ID 提示）瀏覽器預設不會在字中間換行，
              // 字比容器寬就會整段被推出去、對話框看起來像被裁切，要顯式允許斷字。
              <div className="bg-muted/40 space-y-1.5 rounded-md px-3 py-2 text-xs break-words">
                <p className="font-medium">
                  設定步驟：
                  {effectiveServiceAccount.source === "org" && (
                    <span className="text-muted-foreground font-normal">
                      （目前使用這個組織自訂的服務帳戶）
                    </span>
                  )}
                </p>
                <ol className="list-decimal space-y-1 pl-4">
                  <li>
                    到要同步進去的 Google 日曆「設定與共用」，把下面這個信箱加為
                    「進行變更」（Make changes to events）的共用對象：
                  </li>
                </ol>
                <div className="flex items-center gap-1.5">
                  {/* min-w-0 是關鍵：flex 子項預設不會縮到比內容本身還窄（min-width: auto），
                      服務帳戶信箱很長，沒有這個 truncate 不會生效。 */}
                  <code className="bg-background min-w-0 flex-1 truncate rounded border px-2 py-1">
                    {effectiveServiceAccount.email}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => copyEmail(effectiveServiceAccount.email)}
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

            {/* 進階：自訂服務帳戶。多租戶下所有組織預設共用系統的服務帳戶，但某些公司的
                Google Workspace 網域對「網域外的服務帳戶」有信任邊界限制，就算日曆
                ACL、共用政策都設對了實際寫入還是會被擋——這種情況才需要自己在自家網域
                底下建一個服務帳戶覆寫預設，一般組織不需要碰這裡。 */}
            <div className="border-t pt-3.5">
              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between text-left text-xs font-medium"
              >
                <span>
                  進階：自訂服務帳戶
                  {orgServiceAccountEmail && (
                    <span className="text-primary ml-1.5 font-normal">（已設定）</span>
                  )}
                </span>
                <ChevronDown
                  className={cn("h-3.5 w-3.5 transition-transform", advancedOpen && "rotate-180")}
                />
              </button>
              {advancedOpen && (
                <div className="mt-2.5 space-y-2.5">
                  <p className="text-muted-foreground text-xs break-words">
                    大部分組織不需要設定這裡，直接用上面顯示的系統預設服務帳戶即可。只有當
                    貴公司的 Google Workspace 網域擋住了系統預設服務帳戶（日曆 ACL、共用
                    政策都設定正確，寫入卻仍被拒絕）時，才需要在自己的網域底下另外建立一個
                    服務帳戶，貼上憑證覆寫預設。
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="gc-sa-email">服務帳戶 Email</Label>
                    <Input
                      id="gc-sa-email"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      placeholder="xxx@your-project.iam.gserviceaccount.com"
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="gc-sa-key">
                      私鑰（PEM）
                      {orgServiceAccountEmail && (
                        <span className="text-muted-foreground ml-1 font-normal">
                          已設定，留空且不改 Email 即維持現況
                        </span>
                      )}
                    </Label>
                    <Textarea
                      id="gc-sa-key"
                      value={privateKey}
                      onChange={(e) => setPrivateKey(e.target.value)}
                      placeholder={
                        "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
                      }
                      rows={4}
                      className="resize-none font-mono text-xs"
                    />
                    <p className="text-muted-foreground text-xs">
                      貼 JSON 金鑰檔裡 private_key 欄位的完整內容，存進資料庫前會加密。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={saveServiceAccount}
                      disabled={savingAccount || !clientEmail || !privateKey}
                    >
                      {savingAccount ? "儲存中…" : "儲存自訂服務帳戶"}
                    </Button>
                    {orgServiceAccountEmail && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={clearServiceAccount}
                        disabled={savingAccount}
                      >
                        清除，改用系統預設
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
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
