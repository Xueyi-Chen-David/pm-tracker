"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react";
import { generateMeetingSummary } from "@/server/actions/meetings";
import { Markdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ── 清單頁「全部收合 / 展開」：Provider 記錄「被展開」的會議 id，預設全部收合；
//    沒有 Provider（單筆分享頁）一律展開。

type CollapseCtx = {
  collapsed: Set<string>;
  toggle: (id: string) => void;
  setAll: (collapse: boolean) => void;
  ids: string[];
};

const Ctx = createContext<CollapseCtx | null>(null);

export function MeetingCollapseProvider({
  ids,
  children,
}: {
  ids: string[];
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const value: CollapseCtx = {
    collapsed: new Set(ids.filter((id) => !expanded.has(id))),
    ids,
    toggle: (id) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    setAll: (collapse) => setExpanded(collapse ? new Set() : new Set(ids)),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function MeetingCollapseAllButton() {
  const ctx = useContext(Ctx);
  if (!ctx || ctx.ids.length === 0) return null;
  const allCollapsed = ctx.ids.every((id) => ctx.collapsed.has(id));
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 gap-1.5"
      onClick={() => ctx.setAll(!allCollapsed)}
    >
      {allCollapsed ? (
        <ChevronsUpDown className="h-4 w-4" />
      ) : (
        <ChevronsDownUp className="h-4 w-4" />
      )}
      {allCollapsed ? "全部展開" : "全部收合"}
    </Button>
  );
}

/**
 * 會議卡的內容區：「記錄 / AI 總結」兩個分頁 + 收合。
 * AI 總結存在 Meeting.aiSummary；組織有設定 Gemini key（aiEnabled）才能產生 / 重新產生。
 */
export function MeetingBody({
  meetingId,
  notes,
  hasNotes,
  summary,
  summaryAt,
  aiEnabled,
}: {
  meetingId: string;
  /** 記錄內容（已渲染好的 MeetingNotesCanvas）。 */
  notes: React.ReactNode;
  hasNotes: boolean;
  summary: string | null;
  summaryAt: string | null;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const ctx = useContext(Ctx);
  const [tab, setTab] = useState<"notes" | "summary">("notes");
  const [pending, start] = useTransition();
  const collapsed = ctx?.collapsed.has(meetingId) ?? false;
  const showSummaryTab = aiEnabled || !!summary;

  if (!hasNotes && !showSummaryTab) return null;

  function generate() {
    start(async () => {
      const res = await generateMeetingSummary(meetingId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("已產生 AI 總結");
      router.refresh();
    });
  }

  const tabCls = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1 border-b-2 px-2 py-1.5 text-xs font-medium transition-colors",
      active
        ? "border-primary text-foreground"
        : "text-muted-foreground hover:text-foreground border-transparent",
    );

  return (
    <div className="mt-2 border-t">
      <div className="flex items-center gap-1">
        {showSummaryTab ? (
          <>
            <button
              type="button"
              className={tabCls(!collapsed && tab === "notes")}
              onClick={() => {
                setTab("notes");
                if (collapsed) ctx?.toggle(meetingId);
              }}
            >
              <FileText className="h-3.5 w-3.5" /> 記錄
            </button>
            <button
              type="button"
              className={tabCls(!collapsed && tab === "summary")}
              onClick={() => {
                setTab("summary");
                if (collapsed) ctx?.toggle(meetingId);
              }}
            >
              <Sparkles className="h-3.5 w-3.5 text-violet-500" /> AI 總結
            </button>
          </>
        ) : (
          <span className="text-muted-foreground px-2 py-1.5 text-xs">記錄</span>
        )}
        {ctx && (
          <button
            type="button"
            onClick={() => ctx.toggle(meetingId)}
            title={collapsed ? "展開" : "收合"}
            className="text-muted-foreground hover:text-foreground hover:bg-muted ml-auto inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-xs"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", collapsed && "-rotate-90")} />
            {collapsed ? "展開" : "收合"}
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="pt-2">
          {tab === "notes" || !showSummaryTab ? (
            hasNotes ? (
              notes
            ) : (
              <p className="text-muted-foreground py-2 text-xs">尚無會議記錄內容。</p>
            )
          ) : (
            <div className="space-y-2">
              {summary ? (
                <div className="prose-sm text-sm">
                  <Markdown content={summary} />
                </div>
              ) : (
                <p className="text-muted-foreground py-2 text-xs">
                  還沒有 AI 總結。{aiEnabled && hasNotes ? "按下方按鈕，依會議記錄自動整理重點、決議與待辦。" : ""}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {aiEnabled && hasNotes && (
                  <Button size="sm" variant="outline" disabled={pending} onClick={generate}>
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-violet-500" />
                    )}
                    {summary ? "重新產生" : "產生 AI 總結"}
                  </Button>
                )}
                {summaryAt && (
                  <span className="text-muted-foreground text-[11px]">
                    產生於 {new Date(summaryAt).toLocaleString("zh-TW", { hour12: false })}
                    ．會議記錄修改後不會自動更新
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
