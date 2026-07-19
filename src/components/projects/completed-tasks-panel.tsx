import { CheckCircle2, CalendarCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { displayInitial, displayName } from "@/lib/display";
import { fmtDateShort } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { TaskView } from "@/components/tasks/task-row";

/**
 * 專案內「已完成」的任務清單（status = DONE）。只在有已完成任務時才會出現這個分頁，
 * 讓「這個專案完成了哪些事」一目了然；每筆顯示負責人與到期日。
 */
export function CompletedTasksPanel({ tasks }: { tasks: TaskView[] }) {
  const done = tasks.filter((t) => t.status === "DONE");
  const total = tasks.filter((t) => t.status !== "CANCELLED").length;

  if (done.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-sm">
        <CheckCircle2 className="h-5 w-5 opacity-60" />
        目前還沒有已完成的任務。
      </div>
    );
  }

  return (
    <div>
      <p className="text-muted-foreground mb-3 text-xs">
        已完成 <span className="text-emerald-600 font-medium">{done.length}</span>
        {total > 0 && ` / ${total}`} 項任務。
      </p>
      <ul className="divide-y">
        {done.map((t) => {
          const owners = t.owners;
          const ownerText =
            owners.length > 0
              ? owners.map((o) => displayName(o)).join("、")
              : t.ownerLabel;
          return (
            <li key={t.id} className="flex items-center gap-3 py-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.title}</p>
                {(ownerText || t.dueDate) && (
                  <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]">
                    {ownerText && <span className="truncate">{ownerText}</span>}
                    {t.dueDate && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarCheck className="h-3 w-3" />
                        {fmtDateShort(t.dueDate)}
                      </span>
                    )}
                  </p>
                )}
              </div>
              {owners.length > 0 && (
                <span className="flex items-center">
                  {owners.slice(0, 4).map((o, i) => (
                    <Avatar
                      key={o.id}
                      className={cn(
                        "h-6 w-6 border border-white",
                        i > 0 && "-ml-1.5",
                      )}
                    >
                      {o.image && <AvatarImage src={o.image} alt="" />}
                      <AvatarFallback className="text-[9px]">
                        {displayInitial(o)}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
