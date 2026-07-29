"use client";

import { useMemo, useState } from "react";
import { Pencil, Search, Building2, History, Mail, Phone } from "lucide-react";
import { ContactDialog, type ContactView } from "@/components/crm/contact-dialog";
import { CompanyTimelineDialog } from "@/components/crm/company-timeline-dialog";
import type { OwnerLite } from "@/components/okr/key-result-row";

export type ContactRow = ContactView & {
  ownerName: string | null;
  dealCount: number;
};

export function ContactsList({
  contacts,
  members,
}: {
  contacts: ContactRow[];
  members: OwnerLite[];
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return contacts;
    return contacts.filter((c) =>
      [c.name, c.company, c.title, c.email, c.phone]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(kw)),
    );
  }, [contacts, q]);

  if (contacts.length === 0) {
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
        還沒有任何聯絡人。點右上「新增聯絡人」開始建立客戶名單。
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative max-w-xs">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋公司 / 姓名 / Email / 電話…"
          className="border-input h-9 w-full rounded-md border bg-transparent pr-3 pl-8 text-sm outline-none focus:border-ring"
        />
      </div>

      <div className="bg-card overflow-x-auto rounded-xl border">
        <div className="min-w-[720px]">
          <div className="text-muted-foreground bg-muted/50 flex items-center gap-3 border-b px-3 py-2 text-xs font-medium">
            <div className="w-56 shrink-0">公司 / 姓名</div>
            <div className="w-28 shrink-0">職稱</div>
            <div className="flex-1">聯絡方式</div>
            <div className="w-14 shrink-0 text-center">商機</div>
            <div className="w-28 shrink-0">負責人</div>
            <div className="w-16 shrink-0" />
          </div>
          <div className="divide-y">
            {filtered.map((c) => (
              <div
                key={c.id}
                className="hover:bg-muted/40 flex items-center gap-3 px-3 py-2 text-sm"
              >
                <div className="w-56 min-w-0 shrink-0">
                  {c.company ? (
                    <>
                      <div className="flex min-w-0 items-center gap-1 font-semibold">
                        <Building2 className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{c.company}</span>
                      </div>
                      {c.name && (
                        <div className="text-muted-foreground truncate text-xs">
                          {c.name}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="truncate font-semibold">{c.name || "—"}</div>
                  )}
                </div>
                <div className="text-muted-foreground w-28 shrink-0 truncate">
                  {c.title || "—"}
                </div>
                <div className="text-muted-foreground flex-1 space-y-0.5 truncate text-xs">
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      <Mail className="h-3 w-3" /> {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <div className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {c.phone}
                    </div>
                  )}
                  {!c.email && !c.phone && "—"}
                </div>
                <div className="w-14 shrink-0 text-center tabular-nums">
                  {c.dealCount}
                </div>
                <div className="text-muted-foreground w-28 shrink-0 truncate text-xs">
                  {c.ownerName || "—"}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {c.company && (
                    <CompanyTimelineDialog
                      company={c.company}
                      trigger={
                        <button
                          type="button"
                          className="text-muted-foreground hover:bg-muted rounded-md p-1.5"
                          title="企業時間軸"
                        >
                          <History className="h-4 w-4" />
                        </button>
                      }
                    />
                  )}
                  <ContactDialog
                    members={members}
                    contact={c}
                    trigger={
                      <button
                        type="button"
                        className="text-muted-foreground hover:bg-muted rounded-md p-1.5"
                        title="編輯"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
