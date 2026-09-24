import { Users, CalendarDays, Link2, PencilLine } from "lucide-react";
import type { MeetingRow } from "@/server/queries";
import { meetingCategoryBadge } from "@/lib/constants";
import { fmtDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { MeetingNotesCanvas, type NoteImage } from "@/components/meeting-notes-canvas";
import { MeetingBody } from "@/components/meeting-body";

/** 可點的安全連結：有 http(s) 直接用；看起來像網域就補 https；否則回 null（不連）。 */
export function safeLink(url: string): string | null {
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (/^[\w-]+(\.[\w-]+)+/.test(u)) return `https://${u}`;
  return null;
}

/** 顯示用的精簡連結：去掉 https:// 與 www.（配合 max-w + truncate，畫面不會太長）。 */
export function shortLink(url: string): string {
  return url.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
}

/**
 * 單一會議記錄卡：清單頁（含編輯/刪除）與分享用的單筆詳情頁（唯讀，見 meetings/[id]）共用，
 * 避免同一份排版邏輯散落兩處日後改一邊漏一邊。actions 留空＝唯讀（不顯示右上角動作按鈕）。
 */
export function MeetingCard({
  meeting: m,
  nameById,
  memberCount,
  actions,
  aiEnabled = false,
}: {
  meeting: MeetingRow;
  nameById: Map<string, string>;
  memberCount: number;
  actions?: React.ReactNode;
  /** 組織有設定 Gemini key：可產生 AI 總結。 */
  aiEnabled?: boolean;
}) {
  const names = m.attendeeIds
    .map((id) => nameById.get(id))
    .filter((n): n is string => !!n);
  const isAll = memberCount > 0 && names.length === memberCount;
  const attendeeText = [
    names.length ? (isAll ? `全體（${names.length} 人）` : names.join("、")) : "",
    m.attendees,
  ]
    .filter(Boolean)
    .join("；");
  const recorderName = m.recordedById ? (nameById.get(m.recordedById) ?? null) : null;
  const images = (m.noteImages as NoteImage[] | null) ?? [];

  return (
    <div className="bg-card rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs font-medium",
                meetingCategoryBadge(m.category),
              )}
            >
              {m.category}
            </span>
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
              <CalendarDays className="h-3.5 w-3.5" />
              {fmtDate(m.date)}
            </span>
          </div>
          <h3 className="font-semibold">{m.title}</h3>
          {(attendeeText || recorderName) && (
            // 與會者與記錄人同一行時要有間距，不能黏在一起。
            <div className="text-muted-foreground mt-1 flex flex-wrap items-start gap-x-4 gap-y-1 text-xs">
              {attendeeText && (
                <span className="inline-flex items-start gap-1">
                  <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="whitespace-pre-wrap">{attendeeText}</span>
                </span>
              )}
              {recorderName && (
                <span className="inline-flex items-center gap-1">
                  <PencilLine className="h-3.5 w-3.5 shrink-0" />
                  記錄：{recorderName}
                </span>
              )}
            </div>
          )}
          {m.link &&
            (safeLink(m.link) ? (
              <a
                href={safeLink(m.link)!}
                target="_blank"
                rel="noopener noreferrer"
                title={m.link}
                className="text-primary mt-1 flex max-w-full items-center gap-1 text-xs hover:underline"
              >
                <Link2 className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 max-w-[20rem] truncate">
                  {shortLink(m.link)}
                </span>
              </a>
            ) : (
              <div className="text-muted-foreground mt-1 flex max-w-full items-center gap-1 text-xs">
                <Link2 className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 max-w-[20rem] truncate">{m.link}</span>
              </div>
            ))}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        )}
      </div>
      <MeetingBody
        meetingId={m.id}
        hasNotes={!!m.notes || images.length > 0}
        notes={<MeetingNotesCanvas editable={false} defaultNotes={m.notes} legacyImages={images} />}
        summary={m.aiSummary}
        summaryAt={m.aiSummaryAt?.toISOString() ?? null}
        aiEnabled={aiEnabled}
      />
    </div>
  );
}
