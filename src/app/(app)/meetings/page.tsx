import Link from "next/link";
import { Plus, Pencil, Users, CalendarDays } from "lucide-react";
import { requireActiveOrg } from "@/server/org";
import { getMeetings, getOrgMemberUsers } from "@/server/queries";
import { meetingCategoryBadge } from "@/lib/constants";
import { fmtDate } from "@/lib/date";
import { displayName } from "@/lib/display";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { MeetingFormDialog } from "@/components/meeting-form-dialog";
import { MeetingDeleteButton } from "@/components/meeting-delete-button";
import { ViewportScroll } from "@/components/viewport-scroll";
import { Button, buttonVariants } from "@/components/ui/button";

export const metadata = { title: "會議記錄 · Project Pulse" };

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { org } = await requireActiveOrg();
  const { cat } = await searchParams;
  const [all, members] = await Promise.all([
    getMeetings(org.id),
    getOrgMemberUsers(org.id),
  ]);
  const nameById = new Map(members.map((m) => [m.id, displayName(m)]));
  const categories = Array.from(new Set(all.map((m) => m.category)));
  const meetings = cat ? all.filter((m) => m.category === cat) : all;

  return (
    <div>
      <PageHeader title="會議記錄" description={`共 ${all.length} 場會議`}>
        <MeetingFormDialog
          mode="create"
          members={members}
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> 新增會議
            </Button>
          }
        />
      </PageHeader>

      {categories.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <Chip href="/meetings" active={!cat} label="全部" />
          {categories.map((c) => (
            <Chip
              key={c}
              href={`/meetings?cat=${encodeURIComponent(c)}`}
              active={cat === c}
              label={c}
            />
          ))}
        </div>
      )}

      {meetings.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
          {all.length === 0 ? (
            <>
              還沒有任何會議記錄。
              <span className="ml-1">點右上角「新增會議」開始記錄。</span>
            </>
          ) : (
            "這個類別目前沒有會議。"
          )}
        </div>
      ) : (
        <ViewportScroll className="space-y-3 pr-1">
          {meetings.map((m) => {
            const names = m.attendeeIds
              .map((id) => nameById.get(id))
              .filter((n): n is string => !!n);
            const isAll = members.length > 0 && names.length === members.length;
            const attendeeText = [
              names.length
                ? isAll
                  ? `全體（${names.length} 人）`
                  : names.join("、")
                : "",
              m.attendees,
            ]
              .filter(Boolean)
              .join("；");
            return (
              <div key={m.id} className="bg-card rounded-xl border p-4">
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
                    {attendeeText && (
                      <div className="text-muted-foreground mt-1 inline-flex items-start gap-1 text-xs">
                        <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="whitespace-pre-wrap">{attendeeText}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <MeetingFormDialog
                      mode="edit"
                      members={members}
                      values={{
                        id: m.id,
                        date: fmtDateInput(m.date),
                        category: m.category,
                        title: m.title,
                        attendeeIds: m.attendeeIds,
                        attendees: m.attendees,
                        notes: m.notes,
                      }}
                      trigger={
                        <Button variant="ghost" size="icon-sm" title="編輯">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <MeetingDeleteButton id={m.id} title={m.title} />
                  </div>
                </div>
                {m.notes && (
                  <div className="mt-2 border-t pt-2 text-sm whitespace-pre-wrap">
                    {m.notes}
                  </div>
                )}
              </div>
            );
          })}
        </ViewportScroll>
      )}
    </div>
  );
}

function Chip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        buttonVariants({ variant: active ? "default" : "outline", size: "sm" }),
        "rounded-full",
      )}
    >
      {label}
    </Link>
  );
}

/** Date → yyyy-mm-dd（UTC，對應 @db.Date 儲存），給編輯表單的 date input。 */
function fmtDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}
