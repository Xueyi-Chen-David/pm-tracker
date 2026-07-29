"use client";

import { cloneElement, isValidElement, useEffect, useState } from "react";
import { History } from "lucide-react";
import {
  getCompanyTimeline,
  type CompanyTimelineEntry,
} from "@/server/actions/crm";
import { stageColor } from "@/lib/crm";
import { fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

/**
 * 企業時間軸：把某企業（依聯絡人「公司」欄位分組，同名視為同一企業）名下
 * 所有聯絡人的 CRM 活動紀錄、商機跟進活動、商機階段異動，合併成單一時間
 * 軸，清楚看到跟這間企業互動的完整歷史路徑。視覺沿用 deal-dialog.tsx 的
 * 「階段歷程」時間線樣式（左側直線＋色點＋徽章），只是泛化成多種紀錄類型。
 */
export function CompanyTimelineDialog({
  company,
  trigger,
}: {
  company: string;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<CompanyTimelineEntry[]>([]);
  const [contactCount, setContactCount] = useState(0);

  useEffect(() => {
    if (!open) return;
    getCompanyTimeline(company)
      .then((res) => {
        setEntries(res.entries);
        setContactCount(res.contactCount);
      })
      .catch(() => {
        setEntries([]);
        setContactCount(0);
      });
  }, [open, company]);

  return (
    <>
      {isValidElement(trigger)
        ? cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, {
            onClick: () => setOpen(true),
          })
        : trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              <History className="h-4 w-4" /> {company}
            </DialogTitle>
            <DialogDescription>
              {contactCount > 0
                ? `${contactCount} 位聯絡人的完整互動歷史，依時間排序。`
                : "此企業的完整互動歷史，依時間排序。"}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[28rem] overflow-y-auto pr-1">
            {entries.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                尚無任何紀錄。
              </p>
            ) : (
              <ol className="border-muted relative ml-1 space-y-3 border-l pl-4">
                {entries.map((e) => {
                  const col = stageColor(e.color);
                  return (
                    <li key={e.id} className="relative">
                      <span
                        className={cn(
                          "ring-background absolute top-1 -left-[1.35rem] h-2.5 w-2.5 rounded-full ring-2",
                          col.dot,
                        )}
                      />
                      <div className="flex flex-wrap items-center gap-1.5">
                        {e.icon && <span className="text-sm">{e.icon}</span>}
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-xs font-medium",
                            col.chip,
                          )}
                        >
                          {e.chip}
                        </span>
                        {e.fromStageLabel && (
                          <span className="text-muted-foreground text-[11px]">
                            ← {e.fromStageLabel}
                          </span>
                        )}
                        {(e.contactName || e.dealTitle) && (
                          <span className="text-muted-foreground max-w-[10rem] truncate text-[11px]">
                            {[e.contactName, e.dealTitle]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                        <span className="text-muted-foreground ml-auto shrink-0 text-[11px]">
                          {fmtDateTime(e.at)}
                          {e.actor ? ` · ${e.actor}` : ""}
                        </span>
                      </div>
                      {e.detail && (
                        <p className="text-muted-foreground mt-0.5 text-xs break-words whitespace-pre-wrap">
                          {e.detail}
                        </p>
                      )}
                      {e.link && (
                        <p className="text-muted-foreground mt-0.5 truncate text-xs">
                          🔗 {e.link}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
