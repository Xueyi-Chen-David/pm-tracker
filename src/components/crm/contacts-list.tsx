"use client";

import { useMemo, useState } from "react";
import { Pencil, Search, Building2, History, Mail, Phone } from "lucide-react";
import { ContactDialog, type ContactView } from "@/components/crm/contact-dialog";
import { CompanyTimelineDialog } from "@/components/crm/company-timeline-dialog";
import { CopyTextButton } from "@/components/crm/copy-text-button";
import type { OwnerLite } from "@/components/okr/key-result-row";

export type ContactRow = ContactView & {
  ownerName: string | null;
  dealCount: number;
};

/**
 * 單一聯絡人列：依聯絡人清單、依公司展開後的名冊，共用同一份 UI。
 * showCompany=false（依公司展開時用）：公司名稱已經是外層那一行的標題了，
 * 這裡不用再重複顯示一次，只留姓名。
 */
export function ContactRowItem({
  contact: c,
  members,
  aiEnabled = false,
  showCompany = true,
}: {
  contact: ContactRow;
  members: OwnerLite[];
  aiEnabled?: boolean;
  showCompany?: boolean;
}) {
  return (
    <div className="hover:bg-muted/40 flex items-center gap-3 px-3 py-2 text-sm">
      <div className="w-56 min-w-0 shrink-0">
        {showCompany && c.company ? (
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
      <div className="text-muted-foreground flex-1 space-y-0.5 text-xs">
        {c.email && (
          <div className="flex min-w-0 items-center gap-1">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="min-w-0 truncate">{c.email}</span>
            <CopyTextButton text={c.email} label="複製 Email" />
          </div>
        )}
        {c.phone && (
          <div className="flex items-center gap-1 truncate">
            <Phone className="h-3 w-3 shrink-0" /> {c.phone}
          </div>
        )}
        {!c.email && !c.phone && "—"}
      </div>
      <div className="w-14 shrink-0 text-center tabular-nums">{c.dealCount}</div>
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
          aiEnabled={aiEnabled}
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
  );
}

export function ContactsList({
  contacts,
  members,
  aiEnabled = false,
}: {
  contacts: ContactRow[];
  members: OwnerLite[];
  aiEnabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const base = !kw
      ? contacts
      : contacts.filter((c) =>
          [c.name, c.company, c.title, c.email, c.phone]
            .filter(Boolean)
            .some((s) => String(s).toLowerCase().includes(kw)),
        );
    // 依公司排列（同公司的聯絡人相鄰，跟「依公司」視角看到的分組一致），沒填公司的排最後；
    // 同公司內再依姓名排序，而不是預設的建立時間，不然同公司的人會散落在清單各處。
    return [...base].sort((a, b) => {
      const ca = a.company?.trim() || "";
      const cb = b.company?.trim() || "";
      if (!ca && cb) return 1;
      if (ca && !cb) return -1;
      if (ca !== cb) return ca.localeCompare(cb, "zh-Hant");
      return (a.name || "").localeCompare(b.name || "", "zh-Hant");
    });
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
              <ContactRowItem
                key={c.id}
                contact={c}
                members={members}
                aiEnabled={aiEnabled}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
