"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  Search,
  CalendarCheck,
  CalendarX,
  UserCheck,
  UserX,
  UserCog,
  X,
} from "lucide-react";
import type { WorkspaceMember } from "@/server/queries";
import {
  bulkSetMemberActive,
  bulkSetMemberTrackAttendance,
  bulkSetMemberManager,
  type BulkResult,
} from "@/server/actions/team";
import { displayName, displayInitial } from "@/lib/display";
import { cn } from "@/lib/utils";
import { MemberName } from "@/components/member-name";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MemberDeleteButton } from "@/components/member-delete-button";
import { LoginStatusBadge } from "@/components/login-status-badge";
import { WorkDescriptionEditor } from "@/components/work-description-editor";

/** 每列估計高度（px），用來由可用視窗高度換算每頁筆數，並固定清單高度。 */
const ROW_H = 53;
/** 表頭 + 搜尋 + 頁尾控制列預留高度（px）。 */
const RESERVED = 150;
const MIN_PAGE = 4;
/** 手動每頁筆數選項（＋「自動」依視窗高度）。 */
const PAGE_SIZE_OPTIONS = [8, 12, 16, 24, 40] as const;

export function PaginatedMemberList({
  members,
  canManage = true,
  viewerId,
  managerOptions = [],
}: {
  members: WorkspaceMember[];
  canManage?: boolean;
  /** 目前使用者 id；用來判斷「工作描述」是否可編輯（本人或管理者）。 */
  viewerId?: string;
  /** 批次「上級主管」下拉的選項（membership id + 顯示名）。僅管理者用得到。 */
  managerOptions?: { membershipId: string; label: string }[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  // "auto"＝依視窗高度自動；數字＝使用者指定每頁筆數。
  const [sizeMode, setSizeMode] = useState<"auto" | number>("auto");
  const [autoSize, setAutoSize] = useState(12);
  const listRef = useRef<HTMLDivElement>(null);

  // 多選（跨頁 / 跨搜尋，以 userId 記憶）+ 批次操作。
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [managerSel, setManagerSel] = useState(""); // "" / "__clear__" / membershipId
  const [pending, startBulk] = useTransition();

  // 依可用視窗高度動態算每頁筆數（僅「自動」模式套用）：清單最高不超過當前視窗，超出改分頁。
  useEffect(() => {
    function recompute() {
      const el = listRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const avail = window.innerHeight - top - RESERVED;
      const fit = Math.floor(avail / ROW_H);
      setAutoSize(Math.max(MIN_PAGE, fit));
    }
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, []);

  const pageSize = sizeMode === "auto" ? autoSize : sizeMode;

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return members;
    return members.filter((m) =>
      [m.name, m.nickname, m.email, m.jobTitle, m.department]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(kw)),
    );
  }, [members, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  // 於 render 夾住頁碼（頁數 / 每頁筆數變動時自動落在有效範圍，免用 effect setState）。
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);
  // 固定清單高度：多頁時每頁一律預留 pageSize 列高——翻到不足一頁的最後一頁也不縮短，
  // 讓分頁列與距底距離維持固定；單頁（無需分頁）時依內容高度，避免小團隊留大片空白。
  const reserveRows = totalPages > 1 ? pageSize : pageItems.length;

  // ── 多選 ──
  const filteredIds = useMemo(() => filtered.map((m) => m.id), [filtered]);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const someFilteredSelected = filteredIds.some((id) => selected.has(id));
  const selectedIds = useMemo(() => [...selected], [selected]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));
      return next;
    });
  }

  // ── 批次操作：跑 action → toast → 清空選取 → 重新整理 ──
  function runBulk(fn: () => Promise<BulkResult>, verb: string) {
    startBulk(async () => {
      try {
        const r = await fn();
        toast.success(
          `已對 ${r.count} 人${verb}` +
            (r.skipped ? `（${r.skipped} 人略過）` : ""),
        );
        setSelected(new Set());
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "操作失敗");
      }
    });
  }
  function applyManager() {
    if (managerSel === "") return;
    const mid = managerSel === "__clear__" ? null : managerSel;
    runBulk(
      () => bulkSetMemberManager(selectedIds, mid),
      mid ? "設定上級主管" : "清除上級主管",
    );
    setManagerSel("");
  }

  return (
    <div className="space-y-2">
      {/* 搜尋 + 每頁筆數 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="搜尋姓名 / Email / 部門 / 職稱…"
            className="border-input h-9 w-full rounded-md border bg-transparent pr-3 pl-8 text-sm outline-none focus:border-ring"
          />
        </div>
        <label className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs">
          每頁顯示
          <select
            value={sizeMode === "auto" ? "auto" : String(sizeMode)}
            onChange={(e) => {
              const v = e.target.value;
              setSizeMode(v === "auto" ? "auto" : Number(v));
              setPage(0);
            }}
            className="border-input h-8 rounded-md border bg-transparent px-2 text-sm outline-none focus:border-ring"
          >
            <option value="auto">自動</option>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} 人
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* 批次操作列（選了人才出現）：一次對多位套用在職 / 出席追蹤 / 上級主管 */}
      {canManage && selected.size > 0 && (
        <div className="border-primary/30 bg-primary/5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium">已選 {selected.size} 人</span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 text-xs"
            >
              <X className="h-3.5 w-3.5" /> 清除
            </button>
          </div>

          <BulkGroup label="在職">
            <BulkBtn
              disabled={pending}
              onClick={() =>
                runBulk(() => bulkSetMemberActive(selectedIds, true), "設為在職")
              }
            >
              <UserCheck className="h-3.5 w-3.5" /> 設為在職
            </BulkBtn>
            <BulkBtn
              disabled={pending}
              onClick={() =>
                runBulk(() => bulkSetMemberActive(selectedIds, false), "設為停用")
              }
            >
              <UserX className="h-3.5 w-3.5" /> 停用
            </BulkBtn>
          </BulkGroup>

          <BulkGroup label="出席追蹤">
            <BulkBtn
              disabled={pending}
              onClick={() =>
                runBulk(
                  () => bulkSetMemberTrackAttendance(selectedIds, true),
                  "納入出席追蹤",
                )
              }
            >
              <CalendarCheck className="h-3.5 w-3.5" /> 納入
            </BulkBtn>
            <BulkBtn
              disabled={pending}
              onClick={() =>
                runBulk(
                  () => bulkSetMemberTrackAttendance(selectedIds, false),
                  "移出出席追蹤",
                )
              }
            >
              <CalendarX className="h-3.5 w-3.5" /> 移除
            </BulkBtn>
          </BulkGroup>

          {managerOptions.length > 0 && (
            <BulkGroup label="上級主管">
              <select
                value={managerSel}
                disabled={pending}
                onChange={(e) => setManagerSel(e.target.value)}
                className="border-input h-7 max-w-[10rem] rounded-md border bg-transparent px-2 text-xs outline-none focus:border-ring"
              >
                <option value="">指派主管…</option>
                <option value="__clear__">（清除上級主管）</option>
                {managerOptions.map((o) => (
                  <option key={o.membershipId} value={o.membershipId}>
                    {o.label}
                  </option>
                ))}
              </select>
              <BulkBtn disabled={pending || managerSel === ""} onClick={applyManager}>
                <UserCog className="h-3.5 w-3.5" /> 套用
              </BulkBtn>
            </BulkGroup>
          )}

          {pending && (
            <span className="text-muted-foreground text-xs">處理中…</span>
          )}
        </div>
      )}

      <div className="bg-card overflow-x-auto rounded-xl border">
        <div className="min-w-[760px]">
          {/* 表頭 */}
          <div className="text-muted-foreground bg-muted/50 flex items-center gap-3 border-b px-3 py-2 text-xs font-medium">
            {canManage && (
              <div className="flex w-8 shrink-0 justify-center">
                <input
                  type="checkbox"
                  aria-label="全選"
                  checked={allFilteredSelected}
                  ref={(el) => {
                    if (el)
                      el.indeterminate =
                        someFilteredSelected && !allFilteredSelected;
                  }}
                  onChange={toggleAllFiltered}
                  className="accent-primary h-4 w-4 cursor-pointer"
                />
              </div>
            )}
            <div className="w-56 shrink-0">姓名</div>
            <div className="w-28 shrink-0">部門</div>
            <div className="w-28 shrink-0">職稱</div>
            <div className="w-12 shrink-0 text-center">負責</div>
            <div className="w-12 shrink-0 text-center">參與</div>
            <div className="w-12 shrink-0 text-center">週報</div>
            <div className="flex-1">工作描述</div>
            <div className="w-9 shrink-0" />
          </div>

          {/* 列（固定高度：翻頁時分頁列位置不跳動、距底距離一致） */}
          <div
            ref={listRef}
            className="divide-y"
            style={{ minHeight: reserveRows * ROW_H }}
          >
            {pageItems.length === 0 ? (
              <div className="text-muted-foreground px-3 py-10 text-center text-sm">
                找不到符合的成員。
              </div>
            ) : (
              pageItems.map((m) => {
                const checked = selected.has(m.id);
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2",
                      checked ? "bg-primary/5" : "hover:bg-muted/40",
                    )}
                  >
                    {canManage && (
                      <div className="flex w-8 shrink-0 justify-center">
                        <input
                          type="checkbox"
                          aria-label={`選取 ${displayName(m)}`}
                          checked={checked}
                          onChange={() => toggleOne(m.id)}
                          className="accent-primary h-4 w-4 cursor-pointer"
                        />
                      </div>
                    )}
                    <Link
                      href={`/me/${m.id}`}
                      className="flex w-56 shrink-0 items-center gap-2.5"
                    >
                      <Avatar className="h-8 w-8 shrink-0">
                        {m.image && <AvatarImage src={m.image} alt="" />}
                        <AvatarFallback className="text-xs">
                          {displayInitial(m)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <MemberName
                            u={m}
                            className="min-w-0 text-sm font-medium"
                          />
                          {m.isBoss && (
                            <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                          )}
                          {(m.role === "OWNER" || m.role === "ADMIN") && (
                            <span className="shrink-0 rounded bg-violet-100 px-1.5 text-[10px] text-violet-700">
                              {m.role === "OWNER" ? "擁有者" : "管理者"}
                            </span>
                          )}
                          {m.trackAttendance && (
                            <span
                              title="納入出席追蹤"
                              className="inline-flex shrink-0"
                            >
                              <CalendarCheck className="h-3.5 w-3.5 text-emerald-500" />
                            </span>
                          )}
                          {!m.active && (
                            <span className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">
                              停用
                            </span>
                          )}
                          <LoginStatusBadge loggedIn={m.hasLoggedIn} />
                        </div>
                        <div className="text-muted-foreground truncate text-[11px]">
                          {m.email}
                        </div>
                      </div>
                    </Link>
                    <div className="w-28 shrink-0 truncate text-sm">
                      {m.department ? (
                        <span className="bg-muted rounded px-1.5 py-0.5 text-xs">
                          {m.department}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="text-muted-foreground w-28 shrink-0 truncate text-sm">
                      {m.jobTitle || "—"}
                    </div>
                    <div className="w-12 shrink-0 text-center text-sm tabular-nums">
                      {m._count.ownedProjects}
                    </div>
                    <div className="w-12 shrink-0 text-center text-sm tabular-nums">
                      {m._count.memberships}
                    </div>
                    <div className="w-12 shrink-0 text-center text-sm tabular-nums">
                      {m._count.weeklyUpdates}
                    </div>
                    <div className="min-w-0 flex-1">
                      <WorkDescriptionEditor
                        userId={m.id}
                        value={m.workDescription}
                        canEdit={canManage || m.id === viewerId}
                      />
                    </div>
                    <div className="w-9 shrink-0">
                      {canManage && (
                        <MemberDeleteButton
                          id={m.id}
                          name={displayName(m)}
                          mode="icon"
                        />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 分頁列 */}
      <div className="text-muted-foreground flex items-center justify-between px-1 text-xs">
        <span>
          共 {filtered.length} 人
          {filtered.length !== members.length && ` · 全部 ${members.length}`}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className={cn(
                "hover:bg-muted inline-flex h-7 items-center gap-1 rounded-md border px-2",
                safePage === 0 && "opacity-40",
              )}
            >
              <ChevronLeft className="h-4 w-4" /> 上一頁
            </button>
            <span className="tabular-nums">
              第 {safePage + 1} / {totalPages} 頁
            </span>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
              disabled={safePage >= totalPages - 1}
              className={cn(
                "hover:bg-muted inline-flex h-7 items-center gap-1 rounded-md border px-2",
                safePage >= totalPages - 1 && "opacity-40",
              )}
            >
              下一頁 <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** 批次列裡的一組（標籤 + 按鈕）。 */
function BulkGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      {children}
    </div>
  );
}

/** 批次列的小按鈕。 */
function BulkBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="bg-background hover:bg-muted inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs disabled:opacity-50"
    >
      {children}
    </button>
  );
}
