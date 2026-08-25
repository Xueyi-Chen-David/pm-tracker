"use client";

import {
  cloneElement,
  isValidElement,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  FileSpreadsheet,
  Mail,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import {
  setCrmViewCell,
  moveDealStage,
  createSpreadsheetDeal,
  deleteDeal,
  importCrmViewExcelRows,
} from "@/server/actions/crm";
import { stageColor } from "@/lib/crm";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DealDialog } from "@/components/crm/deal-dialog";
import { ViewColumnsDialog } from "@/components/crm/view-manager";
import type { OwnerLite } from "@/components/okr/key-result-row";
import type { CrmCompanyProfileRow } from "@/server/queries";
import type {
  ContactLite,
  DealView,
  StageView,
  CrmViewLite,
  ViewColumn,
  MailCellValue,
} from "@/components/crm/types";

const UNSET = "__unset";
// 凍結第一欄（企業名）用的 sticky 樣式——表頭要疊在最上面（z 最高），表身那一欄要
// 蓋住其他欄位橫向捲動時滑過去的內容，所以也要給實色背景，不能透明。
const STICKY_FIRST_COL = "sticky left-0 bg-card";

const EMPTY_MAIL: MailCellValue = {
  sent: false,
  sentDate: null,
  read: false,
  readDate: null,
  subject: "",
  body: "",
};

/** 舊/壞掉的 JSON 就當空值，不要整格炸掉。 */
function parseMailValue(raw: string | null): MailCellValue {
  if (!raw) return EMPTY_MAIL;
  try {
    return { ...EMPTY_MAIL, ...(JSON.parse(raw) as Partial<MailCellValue>) };
  } catch {
    return EMPTY_MAIL;
  }
}

/** 今天（瀏覽器當地日期），yyyy-mm-dd——勾選當天自動帶日期用。 */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 兩個 yyyy-mm-dd 相差幾天（UTC 錨定，避免時區把日期推前後一天）。 */
function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00Z`).getTime();
  const to = new Date(`${toISO}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

/** 追蹤天數：已讀了就算「讀取到今天」，只寄了還沒讀就算「寄送到今天」；
 *  都還沒寄就沒有天數可算（排序時歸最後）。 */
function trackDays(mail: MailCellValue): number | null {
  const today = todayISO();
  if (mail.read && mail.readDate) return daysBetween(mail.readDate, today);
  if (mail.sent && mail.sentDate) return daysBetween(mail.sentDate, today);
  return null;
}

/** 讀取花了多久（寄送→讀取的天數）；沒有同時兩個日期就沒得算。 */
function readLatencyDays(mail: MailCellValue): number | null {
  if (mail.sentDate && mail.readDate) return daysBetween(mail.sentDate, mail.readDate);
  return null;
}

/** {{企業名}} 替換成該列的公司名稱；header/body/footer 有值的部分才組進去、
 *  中間用空行隔開，最後整段是一次複製貼到 email 用的。 */
function composeMail(
  header: string | null,
  body: string,
  footer: string | null,
  companyName: string,
): string {
  const fill = (s: string | null) => (s ?? "").replaceAll("{{企業名}}", companyName);
  return [fill(header), fill(body), fill(footer)]
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * 匯出 Excel：格式比照「專案追蹤_信件優化.xlsx」——三張工作表（名單／信件／追蹤），
 * 表頭跟「匯入 Excel」用的是同一套「{欄位名稱}-已寄送」等命名，匯出後改一改可以
 * 直接再匯入回來。在瀏覽器端組完直接觸發下載，不經過伺服器。
 */
function exportSpreadsheetExcel(
  view: CrmViewLite,
  deals: DealView[],
  stages: StageView[],
  companyProfiles: CrmCompanyProfileRow[],
) {
  const stageByKey = new Map(stages.map((s) => [s.key, s]));
  const profileByCompany = new Map(companyProfiles.map((p) => [p.company, p]));
  const mailCols = view.columns.filter((c) => c.type === "MAIL");
  const stageCols = view.columns.filter((c) => c.type === "STAGE");
  const otherCols = view.columns.filter((c) => c.type !== "MAIL" && c.type !== "STAGE");
  const companyNameOf = (d: DealView) => d.contact?.company || d.title;

  // 名單_List：企業基本資料，業種／県・市／公式サイト／切入鉤子／備註來自企業檔案
  // （CrmCompanyProfile，跟這個分頁自己的欄位是分開的兩份資料，這裡合併呈現）。
  const listRows = deals.map((d, i) => {
    const profile = profileByCompany.get(companyNameOf(d));
    const row: Record<string, string | number> = {
      No: i + 1,
      企業名: d.title,
      商家Email: d.contact?.email ?? "",
    };
    for (const c of otherCols) row[c.label] = c.valueByDealId[d.id] ?? "";
    row["業種"] = profile?.industry ?? "";
    row["県・市"] = profile?.location ?? "";
    row["公式サイト"] = profile?.website ?? "";
    row["切入鉤子"] = profile?.entryHook ?? "";
    row["備註"] = profile?.note ?? "";
    return row;
  });

  // 信件_Letters：每輪的件名／內容（內容取這家企業自己編輯過的版本，沒編輯過就用
  // 欄位的預設範本——跟畫面上看到的、複製出去的是同一份）。
  const letterRows = deals.map((d, i) => {
    const row: Record<string, string | number> = {
      No: i + 1,
      企業名: d.title,
      商家Email: d.contact?.email ?? "",
    };
    for (const c of mailCols) {
      const mail = parseMailValue(c.valueByDealId[d.id] ?? null);
      row[`${c.label}-件名`] = mail.subject;
      row[`${c.label}-內容`] = mail.body || c.template || "";
    }
    return row;
  });

  // 追蹤_Checklist：狀態＋每輪的寄送／已讀勾選與日期＋其餘自訂欄位。
  const checklistRows = deals.map((d, i) => {
    const row: Record<string, string | number> = {
      No: i + 1,
      企業名: d.title,
      商家Email: d.contact?.email ?? "",
    };
    for (const c of otherCols) row[c.label] = c.valueByDealId[d.id] ?? "";
    for (const c of mailCols) {
      const mail = parseMailValue(c.valueByDealId[d.id] ?? null);
      row[`${c.label}-已寄送`] = mail.sent ? "TRUE" : "";
      row[`${c.label}-日期`] = mail.sentDate ?? "";
      row[`${c.label}-已讀`] = mail.read ? "TRUE" : "";
      row[`${c.label}-已讀日期`] = mail.readDate ?? "";
    }
    for (const c of stageCols) row[c.label] = stageByKey.get(d.stage)?.label ?? d.stage;
    return row;
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(listRows), "名單_List");
  if (mailCols.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(letterRows), "信件_Letters");
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(checklistRows), "追蹤_Checklist");

  XLSX.writeFile(wb, `${view.name}_${todayISO()}.xlsx`);
}

/**
 * 自訂試算表分頁本體：一列＝一個商機（跟 Pipeline／漏斗讀同一份 openDeals），
 * 欄位配置完全自訂（見 view-manager.tsx）。type=STAGE 的欄位直接讀寫
 * deal.stage（走既有的 moveDealStage），這樣這裡改狀態＝看板換欄，兩邊
 * 資料自然同步，不是兩份會兜不起來的平行清單。
 */
export function SpreadsheetView({
  view,
  deals,
  members,
  contacts,
  stages,
  companyProfiles,
}: {
  view: CrmViewLite;
  deals: DealView[];
  members: OwnerLite[];
  contacts: ContactLite[];
  stages: StageView[];
  companyProfiles: CrmCompanyProfileRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // 「暫停追蹤」的商機不列在業務開發清單裡——這是還在推進中的名單，暫停的已經
  // 不是「現在要盯」的對象，去看板的「暫停追蹤」欄才看得到、要復追再從那裡拖出來。
  // PAUSED 是預設種子階段的穩定 key（見 lib/crm.ts DEFAULT_DEAL_STAGES）。
  const activeDeals = deals.filter((d) => d.stage !== "PAUSED");
  // 依某個 MAIL 欄位的追蹤天數排序（點欄名旁的箭頭切換）：一次只排一欄，
  // 沒寄過的（天數算不出來）一律排最後，不受 asc/desc 影響。
  const [sortColumnId, setSortColumnId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(columnId: string) {
    if (sortColumnId !== columnId) {
      setSortColumnId(columnId);
      setSortDir("desc");
    } else if (sortDir === "desc") {
      setSortDir("asc");
    } else {
      setSortColumnId(null);
    }
  }

  const sortColumn = sortColumnId
    ? view.columns.find((c) => c.id === sortColumnId && c.type === "MAIL")
    : undefined;
  const sortedDeals = sortColumn
    ? [...activeDeals]
        .map((d) => ({ d, days: trackDays(parseMailValue(sortColumn.valueByDealId[d.id] ?? null)) }))
        .sort((a, b) => {
          if (a.days === null && b.days === null) return 0;
          if (a.days === null) return 1;
          if (b.days === null) return -1;
          return sortDir === "asc" ? a.days - b.days : b.days - a.days;
        })
        .map((x) => x.d)
    : activeDeals;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      try {
        const res = await fn();
        if (!res.ok) toast.error(res.error ?? "儲存失敗");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "儲存失敗");
      }
    });
  }

  function removeRow(dealId: string, title: string) {
    if (!confirm(`刪除「${title}」？這會一併刪除這筆商機。`)) return;
    run(async () => {
      await deleteDeal(dealId);
      return { ok: true };
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          {activeDeals.length} 家
          {activeDeals.length !== deals.length &&
            `（另有 ${deals.length - activeDeals.length} 家暫停追蹤中，未列出）`}
        </span>
        <div className="flex items-center gap-1.5">
          <ViewColumnsDialog
            view={view}
            trigger={
              <Button variant="outline" size="sm" className="gap-1">
                <Settings2 className="h-3.5 w-3.5" /> 管理欄位
              </Button>
            }
          />
          <ImportExcelDialog
            view={view}
            trigger={
              <Button variant="outline" size="sm" className="gap-1">
                <FileSpreadsheet className="h-3.5 w-3.5" /> 匯入 Excel
              </Button>
            }
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => exportSpreadsheetExcel(view, activeDeals, stages, companyProfiles)}
          >
            <Download className="h-3.5 w-3.5" /> 匯出 Excel
          </Button>
          <AddRowDialog
            stages={stages}
            trigger={
              <Button size="sm" className="gap-1">
                <Plus className="h-3.5 w-3.5" /> 新增列
              </Button>
            }
          />
        </div>
      </div>

      {view.columns.length === 0 ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center rounded-lg border border-dashed text-sm">
          這個分頁還沒有欄位，按「管理欄位」開始新增
        </div>
      ) : (
        <div
          className={cn(
            "min-h-0 flex-1 overflow-auto rounded-lg border",
            pending && "pointer-events-none opacity-60",
          )}
        >
          {/* 刻意不用 <Table> 元件——它自己包一層 overflow-x-auto 的 div，
              巢狀兩層捲動容器會讓 sticky（凍結表頭／凍結欄）失效或抓錯捲動的
              對象。這裡讓外層這顆 div 是唯一的捲動容器，sticky 才會準。 */}
          <table className="w-full caption-bottom text-sm" data-slot="table">
            <TableHeader className="bg-card sticky top-0 z-20">
              <TableRow>
                <TableHead className={cn(STICKY_FIRST_COL, "z-30 min-w-40")}>
                  企業名
                </TableHead>
                <TableHead className="min-w-44">Email</TableHead>
                {view.columns.map((c) => {
                  const SortIcon =
                    sortColumnId !== c.id ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
                  return (
                    <TableHead
                      key={c.id}
                      className={c.type === "MAIL" ? "min-w-64" : "min-w-24"}
                    >
                      <div className="flex items-center gap-1">
                        <span>{c.label}</span>
                        {c.type === "MAIL" && (
                          <button
                            type="button"
                            title="依追蹤天數排序"
                            onClick={() => toggleSort(c.id)}
                            className={cn(
                              "rounded p-0.5",
                              sortColumnId === c.id
                                ? "text-foreground"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            <SortIcon className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </TableHead>
                  );
                })}
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedDeals.map((d) => (
                <TableRow key={d.id}>
                  <TableCell
                    className={cn(STICKY_FIRST_COL, "z-10 font-medium whitespace-normal")}
                  >
                    <DealDialog
                      deal={d}
                      members={members}
                      contacts={contacts}
                      stages={stages}
                      trigger={
                        <button
                          type="button"
                          className="text-left hover:underline"
                        >
                          {d.title}
                        </button>
                      }
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {d.contact?.email || "—"}
                  </TableCell>
                  {view.columns.map((col) => (
                    <TableCell key={col.id} className="align-top">
                      <ViewCell
                        column={col}
                        deal={d}
                        stages={stages}
                        onStageChange={(stageKey) =>
                          run(() => moveDealStage(d.id, stageKey))
                        }
                        onCellChange={(value) =>
                          run(() => setCrmViewCell(d.id, col.id, value))
                        }
                      />
                    </TableCell>
                  ))}
                  <TableCell>
                    <button
                      type="button"
                      title="刪除"
                      onClick={() => removeRow(d.id, d.title)}
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
              {activeDeals.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={view.columns.length + 3}
                    className="text-muted-foreground py-8 text-center"
                  >
                    尚無商機，按「新增列」開始
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </table>
        </div>
      )}
    </div>
  );
}

function ViewCell({
  column,
  deal,
  stages,
  onStageChange,
  onCellChange,
}: {
  column: ViewColumn;
  deal: DealView;
  stages: StageView[];
  onStageChange: (stageKey: string) => void;
  onCellChange: (value: string | null) => void;
}) {
  if (column.type === "STAGE") {
    const stageByKey = new Map(stages.map((s) => [s.key, s]));
    return (
      <Select
        value={deal.stage}
        onValueChange={(v) => typeof v === "string" && onStageChange(v)}
      >
        <SelectTrigger size="sm" className="h-7 text-xs">
          <SelectValue>
            {(v: string) => stageByKey.get(v)?.label ?? v}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {stages.map((s) => (
            <SelectItem key={s.key} value={s.key}>
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  stageColor(s.color).dot,
                )}
              />
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const value = column.valueByDealId[deal.id] ?? null;

  if (column.type === "MAIL") {
    return (
      <MailCell
        column={column}
        value={parseMailValue(value)}
        companyName={deal.contact?.company || deal.title}
        onChange={(next) => onCellChange(JSON.stringify(next))}
      />
    );
  }

  if (column.type === "CHECKBOX") {
    return (
      <Checkbox
        checked={value === "true"}
        onCheckedChange={(c) => onCellChange(c ? "true" : null)}
      />
    );
  }

  if (column.type === "DATE") {
    return (
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) => onCellChange(e.target.value || null)}
        className="border-input focus-visible:ring-ring/50 h-7 w-32 rounded-md border bg-transparent px-1.5 text-xs outline-none focus-visible:ring-2"
      />
    );
  }

  if (column.type === "SELECT") {
    return (
      <Select
        value={value ?? UNSET}
        onValueChange={(v) =>
          typeof v === "string" && onCellChange(v === UNSET ? null : v)
        }
      >
        <SelectTrigger size="sm" className="h-7 text-xs">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNSET}>—</SelectItem>
          {column.selectOptions.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // TEXT — key={value} 讓外部值變了（別人編輯後 refresh）時整個 input 重新掛載，
  // 用新值重置本地草稿；比在 effect 裡 setState 乾淨（避免多一次連鎖渲染）。
  return <TextCell key={value ?? ""} value={value} onCommit={onCellChange} />;
}

/**
 * 一輪寄信：寄送／已讀各自一排（勾選框＋日期，上下排列不並排），下方顯示追蹤天數
 * ——已讀就是「距今幾天」＋「讀取耗時幾天」，只寄了沒讀就是「距今幾天・尚未讀取」。
 * 勾選當天打勾，日期沒填過的話自動帶入今天，不用再手動選一次。信封圖示開啟這家
 * 企業「這一輪」的內容編輯＋預覽＋複製。
 */
function MailCell({
  column,
  value,
  companyName,
  onChange,
}: {
  column: ViewColumn;
  value: MailCellValue;
  companyName: string;
  onChange: (next: MailCellValue) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const days = trackDays(value);
  const latency = readLatencyDays(value);
  const trackText = value.read
    ? `距今 ${days} 天${latency !== null ? `・讀取耗時 ${latency} 天` : ""}`
    : value.sent
      ? `距今 ${days} 天・尚未讀取`
      : null;

  return (
    <>
      <div className="flex items-start gap-1.5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <label
              title="已寄送"
              className="text-muted-foreground flex items-center gap-1 text-[10px]"
            >
              <Checkbox
                checked={value.sent}
                onCheckedChange={(c) =>
                  onChange({
                    ...value,
                    sent: !!c,
                    sentDate: c && !value.sentDate ? todayISO() : value.sentDate,
                  })
                }
              />
              寄
            </label>
            <input
              type="date"
              title="寄送日期"
              value={value.sentDate ?? ""}
              onChange={(e) => onChange({ ...value, sentDate: e.target.value || null })}
              className="border-input focus-visible:ring-ring/50 h-7 w-28 rounded-md border bg-transparent px-1 text-xs outline-none focus-visible:ring-2"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label
              title="已讀"
              className="text-muted-foreground flex items-center gap-1 text-[10px]"
            >
              <Checkbox
                checked={value.read}
                onCheckedChange={(c) =>
                  onChange({
                    ...value,
                    read: !!c,
                    readDate: c && !value.readDate ? todayISO() : value.readDate,
                  })
                }
              />
              讀
            </label>
            <input
              type="date"
              title="已讀日期"
              value={value.readDate ?? ""}
              onChange={(e) => onChange({ ...value, readDate: e.target.value || null })}
              className="border-input focus-visible:ring-ring/50 h-7 w-28 rounded-md border bg-transparent px-1 text-xs outline-none focus-visible:ring-2"
            />
          </div>
          {trackText && (
            <div className="text-muted-foreground text-[10px]">{trackText}</div>
          )}
        </div>
        <button
          type="button"
          title="編輯這家企業的內容並複製信件"
          onClick={() => setEditOpen(true)}
          className="text-muted-foreground hover:bg-muted hover:text-foreground shrink-0 rounded p-1"
        >
          <Mail className="h-3.5 w-3.5" />
        </button>
      </div>
      {editOpen && (
        <MailCellDialog
          column={column}
          value={value}
          companyName={companyName}
          onSave={(patch) => onChange({ ...value, ...patch })}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}

/**
 * 這家企業「這一輪」信件的件名＋內容編輯＋預覽＋複製。中間段（body）是這家企業
 * 自己的，跟其他企業互不影響；第一次打開、這家企業還沒編輯過時，用欄位的 template
 * 當起始稿顯示，但單純打開後不動就關掉不會存檔——只有真的改過內容才會存進這一格，
 * 不然每家企業一開過這個視窗就會把範本原封不動鎖進去，之後改範本它們也不會跟著變了。
 * 開頭／結尾固定顯示欄位設定的內容（要改請到「管理欄位」，那邊改了這一輪全部企業
 * 的頭尾都會跟著變，中間段不會）。
 */
function MailCellDialog({
  column,
  value,
  companyName,
  onSave,
  onClose,
}: {
  column: ViewColumn;
  value: MailCellValue;
  companyName: string;
  onSave: (patch: { subject: string; body: string }) => void;
  onClose: () => void;
}) {
  const initialBody = value.body || column.template || "";
  const [subject, setSubject] = useState(value.subject);
  const [body, setBody] = useState(initialBody);

  function commitIfChanged() {
    // 跟「第一次打開時顯示的內容」比，不是跟「原本存的值」比——這樣單純打開範本
    // 預覽一下就關掉，不會被當成「改過」而存進這一格。
    if (subject !== value.subject || body !== initialBody) {
      onSave({ subject, body });
    }
  }

  function handleClose() {
    commitIfChanged();
    onClose();
  }

  async function copy() {
    commitIfChanged();
    const composed = composeMail(column.header, body, column.footer, companyName);
    const full = subject.trim() ? `件名：${subject.trim()}\n\n${composed}` : composed;
    try {
      await navigator.clipboard.writeText(full);
      toast.success("已儲存並複製信件內容");
    } catch {
      toast.error("複製失敗，請手動選取複製");
    }
  }

  const preview = composeMail(column.header, body, column.footer, companyName);

  return (
    <Dialog open onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {column.label}・{companyName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="mc-subject">件名</Label>
          <Input
            id="mc-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="這封信的標題"
            autoFocus
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mc-body">這家企業的內容（中間段）</Label>
            <Textarea
              id="mc-body"
              rows={12}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="這家企業這一輪要寫的內容，可用 {{企業名}} 插入公司名稱"
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label>預覽（開頭＋內容＋結尾）</Label>
            <Textarea
              readOnly
              rows={12}
              value={preview || "（開頭／內容／結尾都還沒填，先到「管理欄位」設定這一輪）"}
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={handleClose}>
            關閉
          </Button>
          <Button type="button" onClick={copy}>
            儲存並複製整段
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TextCell({
  value,
  onCommit,
}: {
  value: string | null;
  onCommit: (v: string | null) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== (value ?? "")) onCommit(draft || null);
      }}
      placeholder="—"
      className="hover:border-input focus-visible:border-ring focus-visible:ring-ring/50 h-7 w-36 rounded-md border border-transparent bg-transparent px-1.5 text-xs outline-none focus-visible:ring-2"
    />
  );
}

/** 試算表「新增列」：只給公司名稱 + Email，細節事後在商機編輯視窗補。 */
function AddRowDialog({
  trigger,
  stages,
}: {
  trigger: React.ReactElement;
  stages: StageView[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState(stages[0]?.key ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function openDialog() {
    setTitle("");
    setEmail("");
    setStage(stages[0]?.key ?? "");
    setError(null);
    setOpen(true);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return setError("請輸入企業名稱");
    start(async () => {
      try {
        await createSpreadsheetDeal({
          title: title.trim(),
          email: email.trim() || undefined,
          stage: stage || undefined,
        });
        setOpen(false);
        toast.success("已新增");
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
            onClick: openDialog,
          })
        : trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>新增列</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="row-title">企業名稱</Label>
              <Input
                id="row-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例：忠孝酒造株式会社"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="row-email">商家 Email（選填）</Label>
              <Input
                id="row-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="call@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="row-stage">現在ステータス</Label>
              <select
                id="row-stage"
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className="border-input h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm"
              >
                {stages.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            {error && (
              <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                取消
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "新增中…" : "新增"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * 上傳 Excel（在瀏覽器端用 xlsx 套件解析，只把解析完的結構化資料送給 server
 * action——不經手檔案二進位）。表頭文字要跟這個分頁的欄位名稱一致才會寫進對應
 * 格子；企業名稱／Email 的表頭比較寬鬆，「企業名／公司／公司名稱／客戶／company／
 * customer」「Email／商家Email／e-mail／信箱」都認得。全部匯入的列一律落在第一個
 * 階段（預設＝潛在），已經有企業檔案的公司名稱會略過（避免跟既有名單撞名重複）。
 */
function ImportExcelDialog({
  view,
  trigger,
}: {
  view: CrmViewLite;
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function openDialog() {
    setFileName(null);
    setRows(null);
    setError(null);
    setOpen(true);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]!];
        const parsed = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
          defval: "",
          raw: false,
        });
        if (parsed.length === 0) {
          setRows(null);
          setError("這個檔案沒有讀到任何資料列");
          return;
        }
        setRows(parsed);
      } catch {
        setRows(null);
        setError("讀不懂這個檔案，請確認是 .xlsx / .xls 格式");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function submit() {
    if (!rows) return;
    start(async () => {
      try {
        const res = await importCrmViewExcelRows({ viewId: view.id, rows });
        if (!res.ok) return setError(res.error);
        setOpen(false);
        toast.success(`已匯入 ${res.created} 家，略過 ${res.skipped} 家（共 ${res.total} 列）`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "匯入失敗");
      }
    });
  }

  return (
    <>
      {isValidElement(trigger)
        ? cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, {
            onClick: openDialog,
          })
        : trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>匯入 Excel</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-muted-foreground text-xs">
              表頭文字要跟這個分頁的欄位名稱一致才會寫進對應格子；企業名稱／Email
              欄的表頭比較寬鬆。全部匯入的列預設狀態都是「{stagesFallbackLabel(view)}」。
            </p>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFile}
            />
            {rows && (
              <p className="text-sm">
                已讀到「{fileName}」共 <strong>{rows.length}</strong> 列，按「開始匯入」寫入。
              </p>
            )}
            {error && (
              <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="button" onClick={submit} disabled={!rows || pending}>
              {pending ? "匯入中…" : "開始匯入"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 匯入說明文字用：這個分頁裡有沒有 STAGE 欄位就顯示「跟著現在ステータス欄位的第一個選項」，
 *  沒有的話單純顯示「潛在」——只是文案，不影響實際匯入邏輯（實際邏輯在 server action，
 *  一律用組織第一個管線階段)。 */
function stagesFallbackLabel(view: CrmViewLite): string {
  return view.columns.some((c) => c.type === "STAGE") ? "現在ステータス的第一個選項" : "潛在";
}
