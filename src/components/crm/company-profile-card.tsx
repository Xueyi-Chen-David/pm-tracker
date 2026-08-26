"use client";

import { cloneElement, isValidElement, useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, ExternalLink, FileText, Pencil, Plus, Store } from "lucide-react";
import {
  getCompanyProfile,
  getRepresentativeNameSuggestions,
  upsertCompanyProfile,
} from "@/server/actions/crm";
import { PRODUCT_CATEGORY_OPTIONS, EC_PLATFORM_NAMES } from "@/lib/crm-company-stats";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ProfileView = {
  industry: string | null;
  location: string | null;
  headcount: string | null;
  capital: string | null;
  founded: string | null;
  website: string | null;
  representativeName: string | null;
  products: string | null;
  productCategory: string | null;
  companyIntro: string | null;
  entryHook: string | null;
  hasPhysicalStore: boolean | null;
  hasEcommerce: boolean | null;
  ecommercePlatform: string | null;
  grade: string | null;
  note: string | null;
};

/** 產業類別下拉建議——跟 productCategory 不同，這裡不是封閉選項（沒有對應的統計分頁），
 * 純粹是常見值的建議清單，欄位本身還是自由文字，打別的值也可以。 */
const INDUSTRY_SUGGESTIONS = [
  "食品・銘菓",
  "酒類・醸造",
  "調味料・発酵",
  "水産・水産加工",
  "農産物・青果",
  "工芸品・陶磁器",
  "繊維・服飾",
  "木工・家具",
  "美容・化粧品",
  "観光・宿泊",
  "卸売・小売",
  "サービス業",
];

/** 地點下拉建議——先放九州・沖縄八縣（目前名單多來自九州業務開發），一樣是建議不是限制。 */
const LOCATION_SUGGESTIONS = [
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
];

const TRI_STATE = [
  { v: null, label: "不明" },
  { v: true, label: "有" },
  { v: false, label: "無" },
] as const;

/** 「代表人」下拉建議：同組織裡其他公司檔案已經填過的代表人姓名，掛載時抓一次即可
 * （不用每次開對話框都重打，反正是給輸入建議用，稍微舊一點沒關係）。 */
function useRepresentativeNameSuggestions(): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    getRepresentativeNameSuggestions()
      .then(setNames)
      .catch(() => setNames([]));
  }, []);
  return names;
}

/** 表單分區標題——欄位多（14 個）擠在一個大 grid 裡看起來很扁很擠，分成「基本資料／
 * 店面與電商／詳細說明」三段，每段之間留白＋分隔線，才有層次感。純展示，兩個對話框共用。 */
function SectionHeading({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide">
      {icon}
      {children}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      <span className="text-sm whitespace-pre-wrap">{value}</span>
    </div>
  );
}

/**
 * 企業基本檔案卡（依公司字串，同一企業一筆；見 CrmCompanyProfile）：業務開發用的
 * 「這家公司是誰、切入點是什麼」——人數、資本額、地點、產業、產品、公司介紹、切入點、
 * 是否有直營店面、是否有電商／電商平台。跟進度備註（CompanyNotesFeed）分開，那邊記的是
 * 互動過程，這裡記的是公司本身的靜態資料。自包含元件，掛載（展開）時自己抓資料，沒有就
 * 顯示「新增資料」入口；編輯用對話框，欄位多用非受控 ref 讀值（比照 ContactDialog 慣例）。
 */
export function CompanyProfileCard({ company }: { company: string }) {
  const [profile, setProfile] = useState<ProfileView | null | undefined>(undefined);
  const [open, setOpen] = useState(false);

  function refresh() {
    getCompanyProfile(company)
      .then(setProfile)
      .catch(() => setProfile(null));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company]);

  const loaded = profile !== undefined;
  const hasAnyFact =
    !!profile &&
    !!(
      profile.industry ||
      profile.location ||
      profile.headcount ||
      profile.capital ||
      profile.founded ||
      profile.representativeName ||
      profile.products ||
      profile.productCategory ||
      profile.companyIntro ||
      profile.entryHook ||
      profile.hasPhysicalStore !== null ||
      profile.hasEcommerce !== null ||
      profile.ecommercePlatform ||
      profile.note
    );

  return (
    <div className="bg-card flex h-full min-h-0 flex-col rounded-md border">
      <div className="text-muted-foreground flex shrink-0 items-center justify-between gap-1.5 border-b px-3 py-2 text-xs font-medium">
        <span className="flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" />
          公司資料
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <Pencil className="h-3 w-3" />
          {hasAnyFact ? "編輯" : "新增資料"}
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {!loaded ? (
          <div className="text-muted-foreground text-xs">載入中…</div>
        ) : !hasAnyFact ? (
          <p className="text-muted-foreground py-6 text-center text-xs">
            還沒有這家公司的基本資料，點右上「新增資料」開始建立。
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
            <Fact label="產業類別" value={profile?.industry} />
            <Fact label="產品類型" value={profile?.productCategory} />
            <Fact label="地點" value={profile?.location} />
            <Fact label="公司人數" value={profile?.headcount} />
            <Fact label="資本額" value={profile?.capital} />
            <Fact label="創業／設立" value={profile?.founded} />
            <Fact label="代表人" value={profile?.representativeName} />
            <Fact
              label="是否有直營店面"
              value={
                profile?.hasPhysicalStore === null
                  ? null
                  : profile?.hasPhysicalStore
                    ? "有"
                    : "無"
              }
            />
            <Fact
              label="是否有電商"
              value={
                profile?.hasEcommerce === null
                  ? null
                  : profile?.hasEcommerce
                    ? "有"
                    : "無"
              }
            />
            <Fact label="電商平台" value={profile?.ecommercePlatform} />
            <Fact label="優先級" value={profile?.grade} />
            {profile?.website && (
              <div className="col-span-full flex flex-col gap-0.5 sm:col-span-1">
                <span className="text-muted-foreground text-[11px]">官網</span>
                <a
                  href={/^https?:\/\//.test(profile.website) ? profile.website : `https://${profile.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary flex items-center gap-1 text-sm hover:underline"
                >
                  {profile.website}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
            {/* 長文字說明類的欄位橫向鋪滿，並排兩兩一組（夠寬才並排，避免每段話都
                被硬擠成兩欄、每行反而更短更難讀）。 */}
            <div className="col-span-full">
              <Fact label="販賣的產品／業務內容" value={profile?.products} />
            </div>
            <div className="col-span-full lg:col-span-2">
              <Fact label="公司介紹" value={profile?.companyIntro} />
            </div>
            <div className="col-span-full lg:col-span-2">
              <Fact label="切入點" value={profile?.entryHook} />
            </div>
            <div className="col-span-full">
              <Fact label="備註" value={profile?.note} />
            </div>
          </div>
        )}
      </div>

      {/* 對話框永遠掛載，只靠 open prop 控制顯示——比照 ContactDialog／DealDialog 等其他
          CRM 對話框的寫法。曾經寫成 `{open && <Dialog .../>}`，用同一個 open state 同時
          控制「Base UI Dialog 要不要關」跟「這整棵子樹要不要卸載」：一旦 onOpenChange(false)
          觸發，React 會在同一個 commit 把 Dialog 連同它的 Portal/Backdrop 整個強制卸載，
          Base UI 自己「淡出動畫播完才真正卸載」的流程完全沒機會跑，偶爾會讓背景的攔截層
          卡住不清除，導致頁面其他按鈕（例如上面的「新增聯絡人」）點不動、要重新整理才會恢復。 */}
      <CompanyProfileEditDialog
        company={company}
        profile={profile ?? null}
        open={open}
        onOpenChange={setOpen}
        onSaved={refresh}
      />
    </div>
  );
}

type FieldRefs = {
  industryRef: React.RefObject<HTMLInputElement | null>;
  locationRef: React.RefObject<HTMLInputElement | null>;
  headcountRef: React.RefObject<HTMLInputElement | null>;
  capitalRef: React.RefObject<HTMLInputElement | null>;
  foundedRef: React.RefObject<HTMLInputElement | null>;
  websiteRef: React.RefObject<HTMLInputElement | null>;
  representativeRef: React.RefObject<HTMLInputElement | null>;
  ecommerceRef: React.RefObject<HTMLInputElement | null>;
  gradeRef: React.RefObject<HTMLInputElement | null>;
  productsRef: React.RefObject<HTMLTextAreaElement | null>;
  productCategoryRef: React.RefObject<HTMLSelectElement | null>;
  introRef: React.RefObject<HTMLTextAreaElement | null>;
  hookRef: React.RefObject<HTMLTextAreaElement | null>;
  noteRef: React.RefObject<HTMLTextAreaElement | null>;
};

// 這兩個是純函式（非 component／非 hook），只在 effect／submit 這類事件時機被呼叫，
// 不會踩到「render 期間存取 ref」的規則——但 JSX 裡的 `ref={...}` 一定要接直接宣告在
// 該 component 自己身上的 useRef 區域變數，不能透過這種物件屬性間接存取，
// 所以下面兩個對話框的表單欄位沒辦法抽成共用 component，只能各自重複一份 JSX。

function syncFieldRefs(refs: FieldRefs, profile: ProfileView | null) {
  if (refs.industryRef.current) refs.industryRef.current.value = profile?.industry ?? "";
  if (refs.locationRef.current) refs.locationRef.current.value = profile?.location ?? "";
  if (refs.headcountRef.current) refs.headcountRef.current.value = profile?.headcount ?? "";
  if (refs.capitalRef.current) refs.capitalRef.current.value = profile?.capital ?? "";
  if (refs.foundedRef.current) refs.foundedRef.current.value = profile?.founded ?? "";
  if (refs.websiteRef.current) refs.websiteRef.current.value = profile?.website ?? "";
  if (refs.representativeRef.current)
    refs.representativeRef.current.value = profile?.representativeName ?? "";
  if (refs.ecommerceRef.current) refs.ecommerceRef.current.value = profile?.ecommercePlatform ?? "";
  if (refs.gradeRef.current) refs.gradeRef.current.value = profile?.grade ?? "";
  if (refs.productsRef.current) refs.productsRef.current.value = profile?.products ?? "";
  if (refs.productCategoryRef.current)
    refs.productCategoryRef.current.value = profile?.productCategory ?? "";
  if (refs.introRef.current) refs.introRef.current.value = profile?.companyIntro ?? "";
  if (refs.hookRef.current) refs.hookRef.current.value = profile?.entryHook ?? "";
  if (refs.noteRef.current) refs.noteRef.current.value = profile?.note ?? "";
}

/** 讀所有欄位目前的值，交給 upsertCompanyProfile（company 由呼叫端另外帶）。 */
function readFieldRefs(
  refs: FieldRefs,
  hasPhysicalStore: boolean | null,
  hasEcommerce: boolean | null,
) {
  return {
    industry: refs.industryRef.current?.value ?? "",
    location: refs.locationRef.current?.value ?? "",
    headcount: refs.headcountRef.current?.value ?? "",
    capital: refs.capitalRef.current?.value ?? "",
    founded: refs.foundedRef.current?.value ?? "",
    website: refs.websiteRef.current?.value ?? "",
    representativeName: refs.representativeRef.current?.value ?? "",
    ecommercePlatform: refs.ecommerceRef.current?.value ?? "",
    grade: refs.gradeRef.current?.value ?? "",
    products: refs.productsRef.current?.value ?? "",
    productCategory: refs.productCategoryRef.current?.value ?? "",
    companyIntro: refs.introRef.current?.value ?? "",
    entryHook: refs.hookRef.current?.value ?? "",
    note: refs.noteRef.current?.value ?? "",
    hasPhysicalStore,
    hasEcommerce,
  };
}

function CompanyProfileEditDialog({
  company,
  profile,
  open,
  onOpenChange,
  onSaved,
}: {
  company: string;
  profile: ProfileView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const idPrefix = useId();
  const [pending, start] = useTransition();
  const [hasPhysicalStore, setHasPhysicalStore] = useState<boolean | null>(
    profile?.hasPhysicalStore ?? null,
  );
  const [hasEcommerce, setHasEcommerce] = useState<boolean | null>(profile?.hasEcommerce ?? null);
  const repNames = useRepresentativeNameSuggestions();

  const industryRef = useRef<HTMLInputElement>(null);
  const locationRef = useRef<HTMLInputElement>(null);
  const headcountRef = useRef<HTMLInputElement>(null);
  const capitalRef = useRef<HTMLInputElement>(null);
  const foundedRef = useRef<HTMLInputElement>(null);
  const websiteRef = useRef<HTMLInputElement>(null);
  const representativeRef = useRef<HTMLInputElement>(null);
  const ecommerceRef = useRef<HTMLInputElement>(null);
  const gradeRef = useRef<HTMLInputElement>(null);
  const productsRef = useRef<HTMLTextAreaElement>(null);
  const productCategoryRef = useRef<HTMLSelectElement>(null);
  const introRef = useRef<HTMLTextAreaElement>(null);
  const hookRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const refs: FieldRefs = {
    industryRef,
    locationRef,
    headcountRef,
    capitalRef,
    foundedRef,
    websiteRef,
    representativeRef,
    ecommerceRef,
    gradeRef,
    productsRef,
    productCategoryRef,
    introRef,
    hookRef,
    noteRef,
  };

  // 對話框現在永遠掛載（見 CompanyProfileCard 的註解），非受控欄位不會每次打開都重新
  // mount 拿到新的 defaultValue，所以改成每次「關→開」時手動把 ref 值同步成最新 profile。
  useEffect(() => {
    if (!open) return;
    syncFieldRefs(refs, profile);
    // 刻意的表單重置（打開對話框那一刻同步一次），不是外部資料同步，所以不適用
    // 「effect 裡不要直接 setState」的一般建議。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasPhysicalStore(profile?.hasPhysicalStore ?? null);
    setHasEcommerce(profile?.hasEcommerce ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在「開啟那一刻」同步一次，profile 變動不該打斷使用者正在打的字。
  }, [open]);

  function submit() {
    start(async () => {
      try {
        await upsertCompanyProfile({
          company,
          ...readFieldRefs(refs, hasPhysicalStore, hasEcommerce),
        });
        toast.success("已儲存");
        onSaved();
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "儲存失敗");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{company}｜公司資料</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="grid gap-5"
        >
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-5">
              <div className="space-y-3">
                <SectionHeading icon={<Building2 className="h-3.5 w-3.5" />}>基本資料</SectionHeading>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${idPrefix}-industry`}>產業類別</Label>
                    <Input
                      id={`${idPrefix}-industry`}
                      ref={industryRef}
                      list={`${idPrefix}-industry-suggestions`}
                      defaultValue={profile?.industry ?? ""}
                      placeholder="例：食品・銘菓"
                    />
                    <datalist id={`${idPrefix}-industry-suggestions`}>
                      {INDUSTRY_SUGGESTIONS.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${idPrefix}-category`}>產品類型</Label>
                    <select
                      id={`${idPrefix}-category`}
                      ref={productCategoryRef}
                      defaultValue={profile?.productCategory ?? ""}
                      className="border-input h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                    >
                      <option value="">—</option>
                      {PRODUCT_CATEGORY_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${idPrefix}-location`}>地點</Label>
                    <Input
                      id={`${idPrefix}-location`}
                      ref={locationRef}
                      list={`${idPrefix}-location-suggestions`}
                      defaultValue={profile?.location ?? ""}
                      placeholder="例：福岡・新宮町"
                    />
                    <datalist id={`${idPrefix}-location-suggestions`}>
                      {LOCATION_SUGGESTIONS.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${idPrefix}-headcount`}>公司人數</Label>
                    <Input id={`${idPrefix}-headcount`} ref={headcountRef} defaultValue={profile?.headcount ?? ""} placeholder="例：計 66 名" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${idPrefix}-capital`}>資本額</Label>
                    <Input id={`${idPrefix}-capital`} ref={capitalRef} defaultValue={profile?.capital ?? ""} placeholder="例：資本金1000万円" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${idPrefix}-founded`}>創業／設立</Label>
                    <Input id={`${idPrefix}-founded`} ref={foundedRef} defaultValue={profile?.founded ?? ""} placeholder="例：1976年創業" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${idPrefix}-rep`}>代表人</Label>
                    <Input
                      id={`${idPrefix}-rep`}
                      ref={representativeRef}
                      list={`${idPrefix}-rep-suggestions`}
                      defaultValue={profile?.representativeName ?? ""}
                    />
                    <datalist id={`${idPrefix}-rep-suggestions`}>
                      {repNames.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${idPrefix}-website`}>官網</Label>
                    <Input id={`${idPrefix}-website`} ref={websiteRef} defaultValue={profile?.website ?? ""} placeholder="example.co.jp" />
                  </div>
                </div>
              </div>

              <div className="space-y-3 border-t pt-5">
                <SectionHeading icon={<Store className="h-3.5 w-3.5" />}>店面與電商</SectionHeading>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="grid gap-1.5">
                    <Label>是否有直營店面</Label>
                    <div className="flex gap-1.5">
                      {TRI_STATE.map((t) => (
                        <button
                          key={String(t.v)}
                          type="button"
                          onClick={() => setHasPhysicalStore(t.v)}
                          className={cn(
                            "border-input rounded-md border px-3 py-1.5 text-xs",
                            hasPhysicalStore === t.v
                              ? "bg-primary text-primary-foreground border-primary"
                              : "hover:bg-muted",
                          )}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>是否有電商</Label>
                    <div className="flex gap-1.5">
                      {TRI_STATE.map((t) => (
                        <button
                          key={String(t.v)}
                          type="button"
                          onClick={() => setHasEcommerce(t.v)}
                          className={cn(
                            "border-input rounded-md border px-3 py-1.5 text-xs",
                            hasEcommerce === t.v
                              ? "bg-primary text-primary-foreground border-primary"
                              : "hover:bg-muted",
                          )}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${idPrefix}-ec`}>電商平台（若有）</Label>
                    <Input
                      id={`${idPrefix}-ec`}
                      ref={ecommerceRef}
                      list={`${idPrefix}-ec-suggestions`}
                      defaultValue={profile?.ecommercePlatform ?? ""}
                      placeholder="例：Shopify"
                    />
                    <datalist id={`${idPrefix}-ec-suggestions`}>
                      {EC_PLATFORM_NAMES.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${idPrefix}-grade`} className="whitespace-nowrap">
                      優先級
                    </Label>
                    <Input
                      id={`${idPrefix}-grade`}
                      ref={gradeRef}
                      defaultValue={profile?.grade ?? ""}
                      placeholder="例：A／B／C"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3 md:border-l md:pl-6">
              <SectionHeading icon={<FileText className="h-3.5 w-3.5" />}>詳細說明</SectionHeading>
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor={`${idPrefix}-products`}>販賣的產品（代表性列幾種就好）</Label>
                  <Textarea id={`${idPrefix}-products`} ref={productsRef} defaultValue={profile?.products ?? ""} rows={3} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${idPrefix}-intro`}>公司介紹</Label>
                  <Textarea id={`${idPrefix}-intro`} ref={introRef} defaultValue={profile?.companyIntro ?? ""} rows={4} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${idPrefix}-hook`}>切入點</Label>
                  <Textarea id={`${idPrefix}-hook`} ref={hookRef} defaultValue={profile?.entryHook ?? ""} rows={4} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${idPrefix}-note`}>備註</Label>
                  <Textarea id={`${idPrefix}-note`} ref={noteRef} defaultValue={profile?.note ?? ""} rows={3} />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              儲存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 「新增公司」：CRM 頁右上角的獨立入口，不必先加一個聯絡人才能建公司檔案。
 * 表單欄位跟 CompanyProfileEditDialog 是同一份設計（各自獨立宣告 ref，見上面關於
 * react-hooks/refs 規則的說明），差別只在公司名稱本身是可輸入的；送出後呼叫
 * router.refresh() 讓「依公司」列表立刻看到剛建的這家（getCrmCompanies 已把只有
 * profile、還沒有聯絡人的公司也列進去）。
 */
export function AddCompanyDialog({ trigger }: { trigger: React.ReactElement }) {
  const idPrefix = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [hasPhysicalStore, setHasPhysicalStore] = useState<boolean | null>(null);
  const [hasEcommerce, setHasEcommerce] = useState<boolean | null>(null);
  const repNames = useRepresentativeNameSuggestions();

  const companyRef = useRef<HTMLInputElement>(null);
  const industryRef = useRef<HTMLInputElement>(null);
  const locationRef = useRef<HTMLInputElement>(null);
  const headcountRef = useRef<HTMLInputElement>(null);
  const capitalRef = useRef<HTMLInputElement>(null);
  const foundedRef = useRef<HTMLInputElement>(null);
  const websiteRef = useRef<HTMLInputElement>(null);
  const representativeRef = useRef<HTMLInputElement>(null);
  const ecommerceRef = useRef<HTMLInputElement>(null);
  const gradeRef = useRef<HTMLInputElement>(null);
  const productsRef = useRef<HTMLTextAreaElement>(null);
  const productCategoryRef = useRef<HTMLSelectElement>(null);
  const introRef = useRef<HTMLTextAreaElement>(null);
  const hookRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const refs: FieldRefs = {
    industryRef,
    locationRef,
    headcountRef,
    capitalRef,
    foundedRef,
    websiteRef,
    representativeRef,
    ecommerceRef,
    gradeRef,
    productsRef,
    productCategoryRef,
    introRef,
    hookRef,
    noteRef,
  };

  // 每次打開都清空——不在 trigger 的 onClick 裡直接碰 ref（那個 closure 是傳給
  // cloneElement 在 render 期間組出來的，太早碰 ref 會被 react-hooks/refs 規則擋下來），
  // 改成用「開啟後」的 effect 統一重置，跟 CompanyProfileEditDialog 的作法一致。
  useEffect(() => {
    if (!open) return;
    if (companyRef.current) companyRef.current.value = "";
    syncFieldRefs(refs, null);
    // 刻意的表單重置，不是外部資料同步。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasPhysicalStore(null);
    setHasEcommerce(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 開啟時重置表單，刻意的一次性同步。
  }, [open]);

  function submit() {
    const company = companyRef.current?.value.trim() ?? "";
    if (!company) {
      setError("請輸入公司名稱");
      return;
    }
    start(async () => {
      try {
        await upsertCompanyProfile({
          company,
          ...readFieldRefs(refs, hasPhysicalStore, hasEcommerce),
        });
        toast.success("已新增公司");
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "新增失敗");
      }
    });
  }

  return (
    <>
      {isValidElement(trigger)
        ? cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, {
            onClick: () => {
              setError(null);
              setOpen(true);
            },
          })
        : trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新增公司</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="grid gap-5"
          >
            {/* 雙欄版面跟 CompanyProfileEditDialog（編輯用那顆）同一份設計：左邊是結構化
                欄位（基本資料／店面與電商），右邊是長文字說明——兩顆對話框沒辦法共用
                JSX（見檔頭關於 ref-in-render 規則的說明），但版面要保持一致，改一邊
                另一邊沒跟著改，兩顆對話框就會長得不一樣。 */}
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-5">
                <div className="space-y-3">
                  <SectionHeading icon={<Building2 className="h-3.5 w-3.5" />}>基本資料</SectionHeading>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <div className="grid gap-1.5 col-span-2">
                      <Label htmlFor={`${idPrefix}-name`}>公司名稱</Label>
                      <Input id={`${idPrefix}-name`} ref={companyRef} placeholder="例：井上酒造" autoFocus />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${idPrefix}-industry`}>產業類別</Label>
                      <Input
                        id={`${idPrefix}-industry`}
                        ref={industryRef}
                        list={`${idPrefix}-industry-suggestions`}
                        placeholder="例：食品・銘菓"
                      />
                      <datalist id={`${idPrefix}-industry-suggestions`}>
                        {INDUSTRY_SUGGESTIONS.map((p) => (
                          <option key={p} value={p} />
                        ))}
                      </datalist>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${idPrefix}-category`}>產品類型</Label>
                      <select
                        id={`${idPrefix}-category`}
                        ref={productCategoryRef}
                        defaultValue=""
                        className="border-input h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                      >
                        <option value="">—</option>
                        {PRODUCT_CATEGORY_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${idPrefix}-location`}>地點</Label>
                      <Input
                        id={`${idPrefix}-location`}
                        ref={locationRef}
                        list={`${idPrefix}-location-suggestions`}
                        placeholder="例：福岡・新宮町"
                      />
                      <datalist id={`${idPrefix}-location-suggestions`}>
                        {LOCATION_SUGGESTIONS.map((p) => (
                          <option key={p} value={p} />
                        ))}
                      </datalist>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${idPrefix}-headcount`}>公司人數</Label>
                      <Input id={`${idPrefix}-headcount`} ref={headcountRef} placeholder="例：計 66 名" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${idPrefix}-capital`}>資本額</Label>
                      <Input id={`${idPrefix}-capital`} ref={capitalRef} placeholder="例：資本金1000万円" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${idPrefix}-founded`}>創業／設立</Label>
                      <Input id={`${idPrefix}-founded`} ref={foundedRef} placeholder="例：1976年創業" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${idPrefix}-rep`}>代表人</Label>
                      <Input
                        id={`${idPrefix}-rep`}
                        ref={representativeRef}
                        list={`${idPrefix}-rep-suggestions`}
                      />
                      <datalist id={`${idPrefix}-rep-suggestions`}>
                        {repNames.map((p) => (
                          <option key={p} value={p} />
                        ))}
                      </datalist>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${idPrefix}-website`}>官網</Label>
                      <Input id={`${idPrefix}-website`} ref={websiteRef} placeholder="example.co.jp" />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 border-t pt-5">
                  <SectionHeading icon={<Store className="h-3.5 w-3.5" />}>店面與電商</SectionHeading>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <div className="grid gap-1.5">
                      <Label>是否有直營店面</Label>
                      <div className="flex gap-1.5">
                        {TRI_STATE.map((t) => (
                          <button
                            key={String(t.v)}
                            type="button"
                            onClick={() => setHasPhysicalStore(t.v)}
                            className={cn(
                              "border-input rounded-md border px-3 py-1.5 text-xs",
                              hasPhysicalStore === t.v
                                ? "bg-primary text-primary-foreground border-primary"
                                : "hover:bg-muted",
                            )}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>是否有電商</Label>
                      <div className="flex gap-1.5">
                        {TRI_STATE.map((t) => (
                          <button
                            key={String(t.v)}
                            type="button"
                            onClick={() => setHasEcommerce(t.v)}
                            className={cn(
                              "border-input rounded-md border px-3 py-1.5 text-xs",
                              hasEcommerce === t.v
                                ? "bg-primary text-primary-foreground border-primary"
                                : "hover:bg-muted",
                            )}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${idPrefix}-ec`}>電商平台（若有）</Label>
                      <Input
                        id={`${idPrefix}-ec`}
                        ref={ecommerceRef}
                        list={`${idPrefix}-ec-suggestions`}
                        placeholder="例：Shopify"
                      />
                      <datalist id={`${idPrefix}-ec-suggestions`}>
                        {EC_PLATFORM_NAMES.map((p) => (
                          <option key={p} value={p} />
                        ))}
                      </datalist>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${idPrefix}-grade`} className="whitespace-nowrap">
                        優先級
                      </Label>
                      <Input id={`${idPrefix}-grade`} ref={gradeRef} placeholder="例：A／B／C" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 md:border-l md:pl-6">
                <SectionHeading icon={<FileText className="h-3.5 w-3.5" />}>詳細說明</SectionHeading>
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${idPrefix}-products`}>販賣的產品（代表性列幾種就好）</Label>
                    <Textarea id={`${idPrefix}-products`} ref={productsRef} rows={3} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${idPrefix}-intro`}>公司介紹</Label>
                    <Textarea id={`${idPrefix}-intro`} ref={introRef} rows={4} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${idPrefix}-hook`}>切入點</Label>
                    <Textarea id={`${idPrefix}-hook`} ref={hookRef} rows={4} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${idPrefix}-note`}>備註</Label>
                    <Textarea id={`${idPrefix}-note`} ref={noteRef} rows={3} />
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={pending}>
                <Plus className="h-4 w-4" /> 新增
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
