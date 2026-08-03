"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ContactsList, type ContactRow } from "@/components/crm/contacts-list";
import { CompaniesList } from "@/components/crm/companies-list";
import type { OwnerLite } from "@/components/okr/key-result-row";
import type { CompanyRow } from "@/server/queries";

/**
 * 「聯絡人」分頁本體：同一份資料，依聯絡人 / 依公司兩種視角切換，不是兩個
 * 獨立分頁。依公司視角可以展開看旗下聯絡人、設決策角色 / 匯報關係。
 */
export function ContactsSection({
  contacts,
  companies,
  members,
  aiEnabled,
}: {
  contacts: ContactRow[];
  companies: CompanyRow[];
  members: OwnerLite[];
  aiEnabled?: boolean;
}) {
  const [view, setView] = useState<"contacts" | "companies">("contacts");

  return (
    <div className="space-y-2">
      <div className="bg-muted inline-flex items-center gap-0.5 rounded-lg p-0.5 text-sm">
        <ViewButton active={view === "contacts"} onClick={() => setView("contacts")}>
          依聯絡人
        </ViewButton>
        <ViewButton active={view === "companies"} onClick={() => setView("companies")}>
          依公司
        </ViewButton>
      </div>

      {view === "contacts" ? (
        <ContactsList contacts={contacts} members={members} aiEnabled={aiEnabled} />
      ) : (
        <CompaniesList
          companies={companies}
          contacts={contacts}
          members={members}
          aiEnabled={aiEnabled}
        />
      )}
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1 font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
