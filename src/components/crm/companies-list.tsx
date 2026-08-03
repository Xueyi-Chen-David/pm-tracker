"use client";

import { useMemo, useState } from "react";
import { Search, Building2, ChevronRight, MessageSquare } from "lucide-react";
import { ContactRowItem, type ContactRow } from "@/components/crm/contacts-list";
import { CompanyNotesFeed } from "@/components/crm/company-notes-feed";
import { fmtMoneyShort } from "@/lib/crm";
import { cn } from "@/lib/utils";
import type { OwnerLite } from "@/components/okr/key-result-row";
import type { CompanyRow } from "@/server/queries";

/**
 * 以公司為單位的檢視：一行一間公司，點列展開後看兩塊——旗下聯絡人（跟依聯絡人
 * 清單同一份 UI）+ 進度備註動態（每個人留言記錄進度，可回覆）。
 */
export function CompaniesList({
  companies,
  contacts,
  members,
  aiEnabled = false,
}: {
  companies: CompanyRow[];
  contacts: ContactRow[];
  members: OwnerLite[];
  aiEnabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return companies;
    return companies.filter((c) => c.company.toLowerCase().includes(kw));
  }, [companies, q]);

  function toggle(company: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(company)) next.delete(company);
      else next.add(company);
      return next;
    });
  }

  if (companies.length === 0) {
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
        還沒有任何公司資料。聯絡人填了「公司」欄位後，會自動彙整在這裡。
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
          placeholder="搜尋公司…"
          className="border-input h-9 w-full rounded-md border bg-transparent pr-3 pl-8 text-sm outline-none focus:border-ring"
        />
      </div>

      <div className="bg-card overflow-x-auto rounded-xl border">
        <div className="min-w-[720px]">
          <div className="text-muted-foreground bg-muted/50 flex items-center gap-3 border-b px-3 py-2 text-xs font-medium">
            <div className="w-56 shrink-0">公司</div>
            <div className="w-14 shrink-0 text-center">聯絡人</div>
            <div className="w-32 shrink-0">進行中商機</div>
            <div className="w-32 shrink-0">已成交</div>
            <div className="flex-1">最新備註</div>
          </div>
          <div className="divide-y">
            {filtered.map((c) => {
              const isOpen = expanded.has(c.company);
              const companyContacts = contacts.filter(
                (ct) => ct.company === c.company,
              );
              return (
                <div key={c.company}>
                  <div
                    onClick={() => toggle(c.company)}
                    className="hover:bg-muted/40 flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-sm"
                  >
                    <div className="flex w-56 min-w-0 shrink-0 items-center gap-1 font-semibold">
                      <ChevronRight
                        className={cn(
                          "text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform",
                          isOpen && "rotate-90",
                        )}
                      />
                      <Building2 className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{c.company}</span>
                    </div>
                    <div className="w-14 shrink-0 text-center tabular-nums">
                      {c.contactCount}
                    </div>
                    <div className="w-32 shrink-0 text-xs tabular-nums">
                      {c.openDealCount > 0 ? (
                        <>
                          {c.openDealCount} 個 ·{" "}
                          <span className="font-medium">
                            {fmtMoneyShort(c.openValue)}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="w-32 shrink-0 text-xs tabular-nums">
                      {c.wonDealCount > 0 ? (
                        <>
                          {c.wonDealCount} 個 ·{" "}
                          <span className="font-medium text-emerald-600">
                            {fmtMoneyShort(c.wonValue)}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="text-muted-foreground flex-1 items-center gap-1 truncate text-xs">
                      {c.noteCount > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="h-3 w-3 shrink-0" />
                          {c.latestNote}
                          <span className="shrink-0">（共 {c.noteCount} 則）</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </div>
                  </div>
                  {isOpen && (
                    <div className="bg-muted/20 flex flex-col gap-3 border-t p-3 lg:flex-row">
                      <div className="min-w-0 flex-1">
                        <div className="text-muted-foreground mb-1.5 px-1 text-xs font-medium">
                          聯絡人
                        </div>
                        <div className="bg-card divide-y rounded-md border">
                          {companyContacts.map((ct) => (
                            <ContactRowItem
                              key={ct.id}
                              contact={ct}
                              members={members}
                              aiEnabled={aiEnabled}
                              showCompany={false}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="h-80 lg:w-96 lg:shrink-0">
                        <CompanyNotesFeed company={c.company} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
