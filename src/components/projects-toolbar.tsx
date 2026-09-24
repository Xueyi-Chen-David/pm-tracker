"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import {
  HEALTH_OPTIONS,
  PRIORITY_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  PROJECT_TYPE_OPTIONS,
} from "@/lib/constants";
import {
  SORT_DEFAULT_DIR,
  SORT_OPTIONS,
  type SortDir,
  type SortKey,
} from "@/lib/project-filter";
import { useListParams } from "@/lib/use-list-params";
import { cn } from "@/lib/utils";

const selectClass =
  "border-input bg-card h-8 rounded-lg border px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] data-[active=true]:border-primary data-[active=true]:text-primary";

type OwnerOption = { id: string; label: string };

function FilterSelect({
  value,
  options,
  placeholder,
  onChange,
  noneLabel,
}: {
  value: string;
  options: { value: string; label: string }[];
  placeholder: string;
  onChange: (value: string) => void;
  /** 額外的「未指派」之類選項（value 非空）。 */
  noneLabel?: { value: string; label: string };
}) {
  return (
    <select
      value={value}
      data-active={value !== ""}
      onChange={(e) => onChange(e.target.value)}
      className={selectClass}
      aria-label={placeholder}
    >
      <option value="">{placeholder}</option>
      {noneLabel && <option value={noneLabel.value}>{noneLabel.label}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ProjectsToolbar({
  owners,
  children,
}: {
  owners: OwnerOption[];
  /** 靠右放的額外動作（例如「全部收合 / 展開」）。 */
  children?: React.ReactNode;
}) {
  const { params, setParams, pending } = useListParams();

  const get = (key: string) => params.get(key) ?? "";
  const sort = (params.get("sort") as SortKey) || "default";
  const dir: SortDir =
    params.get("dir") === "asc" || params.get("dir") === "desc"
      ? (params.get("dir") as SortDir)
      : SORT_DEFAULT_DIR[sort];

  // 關鍵字：本地受控 + debounce，避免每個按鍵都觸發導航
  const paramQ = get("q");
  const [q, setQ] = useState(paramQ);
  // 外部變更（如「清除」、上一頁/下一頁）時於 render 期間同步回輸入框，
  // 不用 effect（React 建議的 prop 變更調整 state 寫法）。
  const [syncedQ, setSyncedQ] = useState(paramQ);
  if (paramQ !== syncedQ) {
    setSyncedQ(paramQ);
    setQ(paramQ);
  }
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function onSearch(value: string) {
    setQ(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(
      () => setParams({ q: value.trim() || null }),
      300,
    );
  }

  const activeKeys = ["q", "type", "status", "priority", "health", "owner"];
  const activeCount = activeKeys.filter((k) => params.get(k)).length;

  return (
    <div className="bg-muted/40 mb-4 flex flex-wrap items-center gap-2 rounded-xl border p-2">
      {/* 關鍵字搜尋 */}
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
        <input
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="搜尋名稱…"
          className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-40 rounded-lg border pr-2 pl-7 text-sm outline-none focus-visible:ring-[3px] sm:w-48"
        />
      </div>

      <FilterSelect
        value={get("type")}
        options={PROJECT_TYPE_OPTIONS}
        placeholder="全部類型"
        onChange={(v) => setParams({ type: v })}
      />
      <FilterSelect
        value={get("status")}
        options={PROJECT_STATUS_OPTIONS}
        placeholder="全部狀態"
        onChange={(v) => setParams({ status: v })}
      />
      <FilterSelect
        value={get("priority")}
        options={PRIORITY_OPTIONS}
        placeholder="全部優先序"
        onChange={(v) => setParams({ priority: v })}
      />
      <FilterSelect
        value={get("health")}
        options={HEALTH_OPTIONS}
        placeholder="全部健康度"
        onChange={(v) => setParams({ health: v })}
      />
      <FilterSelect
        value={get("owner")}
        options={owners.map((o) => ({ value: o.id, label: o.label }))}
        placeholder="全部負責人"
        noneLabel={{ value: "none", label: "未指派" }}
        onChange={(v) => setParams({ owner: v })}
      />

      {/* 排序 */}
      <div className="ml-auto flex items-center gap-1.5">
        <span className="text-muted-foreground hidden text-xs sm:inline">排序</span>
        <select
          value={sort}
          data-active={sort !== "default"}
          onChange={(e) =>
            // 換欄位時清掉明確方向，改用該欄位的預設方向
            setParams({
              sort: e.target.value === "default" ? null : e.target.value,
              dir: null,
            })
          }
          className={selectClass}
          aria-label="排序欄位"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={sort === "default"}
          onClick={() => setParams({ dir: dir === "asc" ? "desc" : "asc" })}
          className="border-input bg-card text-muted-foreground hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors disabled:opacity-40"
          title={dir === "asc" ? "升冪（小→大）" : "降冪（大→小）"}
          aria-label="切換排序方向"
        >
          {dir === "asc" ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* 清除 */}
      {activeCount > 0 && (
        <button
          type="button"
          onClick={() =>
            setParams({
              q: null,
              type: null,
              status: null,
              priority: null,
              health: null,
              owner: null,
            })
          }
          className="text-muted-foreground hover:text-foreground inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm transition-colors"
        >
          <X className="h-3.5 w-3.5" /> 清除（{activeCount}）
        </button>
      )}

      <span
        className={cn(
          "pointer-events-none transition-opacity",
          pending ? "opacity-100" : "opacity-0",
        )}
        aria-hidden
      >
        <span className="border-muted-foreground/40 border-t-foreground inline-block h-3.5 w-3.5 animate-spin rounded-full border-2" />
      </span>

      {children ? <div className="ml-auto flex items-center gap-2">{children}</div> : null}
    </div>
  );
}
