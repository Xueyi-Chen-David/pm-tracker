"use client";

import { useMemo, useState } from "react";
import { Filter, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EMPTY_COMPANY_PROFILE_FILTER,
  companyProfileFilterActiveCount,
  type CompanyProfileFilter,
  type CompanyProfileLite,
} from "@/lib/crm";
import { PRODUCT_CATEGORY_OPTIONS } from "@/lib/crm-company-stats";
import { ContactsList, type ContactRow } from "@/components/crm/contacts-list";
import { CompaniesList } from "@/components/crm/companies-list";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { OwnerLite } from "@/components/okr/key-result-row";
import type { CompanyRow, CrmCompanyProfileRow } from "@/server/queries";

/**
 * 「聯絡人」分頁本體：同一份資料，依聯絡人 / 依公司兩種視角切換，不是兩個
 * 獨立分頁。依公司視角可以展開看旗下聯絡人、設決策角色 / 匯報關係。
 *
 * 切換鈕＋搜尋框＋篩選合成一個 sticky 標頭，freeze 在分頁內容區頂端不隨清單捲動——
 * 搜尋字串跟公司基本檔案篩選條件都統一由這裡管理、往下傳給兩個清單當 prop，
 * 天生同一行不會疊。篩選依據的是公司基本檔案（CrmCompanyProfile：地區／產業類別／
 * 產品類型／是否有電商），依聯絡人視角時用聯絡人的 company 字串反查對應檔案。
 */
export function ContactsSection({
  contacts,
  companies,
  companyProfiles,
  members,
  aiEnabled,
}: {
  contacts: ContactRow[];
  companies: CompanyRow[];
  companyProfiles: CrmCompanyProfileRow[];
  members: OwnerLite[];
  aiEnabled?: boolean;
}) {
  const [view, setView] = useState<"contacts" | "companies">("contacts");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<CompanyProfileFilter>(EMPTY_COMPANY_PROFILE_FILTER);
  const activeCount = companyProfileFilterActiveCount(filter);

  const profileByCompany = useMemo(
    () => new Map<string, CompanyProfileLite>(companyProfiles.map((p) => [p.company, p])),
    [companyProfiles],
  );

  const locationOptions = useMemo(
    () => uniqueSorted(companyProfiles.map((p) => p.location)),
    [companyProfiles],
  );
  const industryOptions = useMemo(
    () => uniqueSorted(companyProfiles.map((p) => p.industry)),
    [companyProfiles],
  );

  return (
    <div className="space-y-2">
      <div className="bg-background sticky top-0 z-10 flex items-center gap-2 pb-2">
        <div className="bg-muted inline-flex shrink-0 items-center gap-0.5 rounded-lg p-0.5 text-sm">
          <ViewButton active={view === "contacts"} onClick={() => setView("contacts")}>
            依聯絡人
          </ViewButton>
          <ViewButton active={view === "companies"} onClick={() => setView("companies")}>
            依公司
          </ViewButton>
        </div>
        <div className="relative max-w-xs flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={view === "contacts" ? "搜尋公司 / 姓名 / Email / 電話…" : "搜尋公司…"}
            className="border-input h-9 w-full rounded-md border bg-transparent pr-3 pl-8 text-sm outline-none focus:border-ring"
          />
        </div>

        <Popover>
          <PopoverTrigger
            className={cn(
              "border-input flex h-9 shrink-0 items-center gap-1.5 rounded-md border bg-transparent px-3 text-sm outline-none",
              activeCount > 0 && "border-primary text-primary",
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            篩選
            {activeCount > 0 && (
              <span className="bg-primary text-primary-foreground flex h-4 w-4 items-center justify-center rounded-full text-[10px]">
                {activeCount}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <div className="grid gap-2.5">
              <FilterSelect
                label="地區"
                value={filter.location}
                onChange={(v) => setFilter((f) => ({ ...f, location: v }))}
                options={locationOptions}
              />
              <FilterSelect
                label="產業類別"
                value={filter.industry}
                onChange={(v) => setFilter((f) => ({ ...f, industry: v }))}
                options={industryOptions}
              />
              <FilterSelect
                label="產品類型"
                value={filter.productCategory}
                onChange={(v) => setFilter((f) => ({ ...f, productCategory: v }))}
                options={[...PRODUCT_CATEGORY_OPTIONS]}
              />
              <div className="grid gap-1">
                <span className="text-muted-foreground text-xs">是否有電商</span>
                <select
                  value={filter.hasEcommerce}
                  onChange={(e) =>
                    setFilter((f) => ({
                      ...f,
                      hasEcommerce: e.target.value as CompanyProfileFilter["hasEcommerce"],
                    }))
                  }
                  className="border-input h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                >
                  <option value="">不限</option>
                  <option value="true">有</option>
                  <option value="false">無</option>
                </select>
              </div>
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilter(EMPTY_COMPANY_PROFILE_FILTER)}
                  className="text-muted-foreground hover:text-foreground text-left text-xs underline underline-offset-2"
                >
                  清除篩選
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {view === "contacts" ? (
        <ContactsList
          contacts={contacts}
          members={members}
          aiEnabled={aiEnabled}
          query={q}
          profileByCompany={profileByCompany}
          profileFilter={filter}
        />
      ) : (
        <CompaniesList
          companies={companies}
          contacts={contacts}
          members={members}
          aiEnabled={aiEnabled}
          query={q}
          profileByCompany={profileByCompany}
          profileFilter={filter}
        />
      )}
    </div>
  );
}

function uniqueSorted(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v?.trim()))].sort((a, b) =>
    a.localeCompare(b, "ja"),
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="grid gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-input h-9 w-full rounded-md border bg-transparent px-2 text-sm"
      >
        <option value="">不限</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
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
