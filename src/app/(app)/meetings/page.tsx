import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import { requireActiveOrg } from "@/server/org";
import { getMeetings, getOrgMemberUsers } from "@/server/queries";
import { displayName } from "@/lib/display";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { MeetingFormDialog } from "@/components/meeting-form-dialog";
import { MeetingDeleteButton } from "@/components/meeting-delete-button";
import { MeetingCard } from "@/components/meeting-card";
import { CopyLinkButton } from "@/components/copy-link-button";
import type { NoteImage } from "@/components/meeting-notes-canvas";
import { ViewportScroll } from "@/components/viewport-scroll";
import {
  MeetingCollapseAllButton,
  MeetingCollapseProvider,
} from "@/components/meeting-body";
import { isAiEnabled } from "@/server/gemini";
import { Button, buttonVariants } from "@/components/ui/button";

export const metadata = { title: "會議記錄 · Project Pulse" };

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { org, user } = await requireActiveOrg();
  const { cat } = await searchParams;
  const [all, members, aiEnabled] = await Promise.all([
    getMeetings(org.id),
    getOrgMemberUsers(org.id),
    isAiEnabled(org.id),
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
          currentUserId={user.id}
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> 新增會議
            </Button>
          }
        />
      </PageHeader>

      <MeetingCollapseProvider ids={meetings.map((m) => m.id)}>
      {(categories.length > 0 || meetings.length > 0) && (
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
          <div className="ml-auto">
            <MeetingCollapseAllButton />
          </div>
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
            const images = (m.noteImages as NoteImage[] | null) ?? [];
            return (
              <MeetingCard
                key={m.id}
                meeting={m}
                nameById={nameById}
                memberCount={members.length}
                aiEnabled={aiEnabled}
                actions={
                  <>
                    <CopyLinkButton path={`/meetings/${m.id}`} />
                    <MeetingFormDialog
                      mode="edit"
                      members={members}
                      currentUserId={user.id}
                      values={{
                        id: m.id,
                        date: fmtDateInput(m.date),
                        category: m.category,
                        title: m.title,
                        attendeeIds: m.attendeeIds,
                        attendees: m.attendees,
                        link: m.link,
                        notes: m.notes,
                        legacyImages: images,
                        recordedById: m.recordedById,
                      }}
                      trigger={
                        <Button variant="ghost" size="icon-sm" title="編輯">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <MeetingDeleteButton id={m.id} title={m.title} />
                  </>
                }
              />
            );
          })}
        </ViewportScroll>
      )}
      </MeetingCollapseProvider>
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
