"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Crown, Search } from "lucide-react";
import type { WorkspaceMember } from "@/server/queries";
import { displayName, displayInitial } from "@/lib/display";
import { cn } from "@/lib/utils";
import { MemberName } from "@/components/member-name";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MemberDeleteButton } from "@/components/member-delete-button";
import { LoginStatusBadge } from "@/components/login-status-badge";

/** 每列估計高度（px），用來由可用視窗高度換算每頁筆數。 */
const ROW_H = 53;
/** 表頭 + 搜尋 + 頁尾控制列預留高度（px）。 */
const RESERVED = 150;
const MIN_PAGE = 4;

export function PaginatedMemberList({
  members,
  canManage = true,
}: {
  members: WorkspaceMember[];
  canManage?: boolean;
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(12);
  const listRef = useRef<HTMLDivElement>(null);

  // 依可用視窗高度動態算每頁筆數：清單最高不超過當前視窗，超出改分頁。
  useEffect(() => {
    function recompute() {
      const el = listRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const avail = window.innerHeight - top - RESERVED;
      const fit = Math.floor(avail / ROW_H);
      setPageSize(Math.max(MIN_PAGE, fit));
    }
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, []);

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

  return (
    <div className="space-y-2">
      {/* 搜尋 */}
      <div className="relative max-w-xs">
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

      <div className="bg-card overflow-x-auto rounded-xl border">
        <div className="min-w-[720px]">
          {/* 表頭 */}
          <div className="text-muted-foreground bg-muted/50 flex items-center gap-3 border-b px-3 py-2 text-xs font-medium">
            <div className="w-56 shrink-0">姓名</div>
            <div className="w-28 shrink-0">部門</div>
            <div className="w-28 shrink-0">職稱</div>
            <div className="w-12 shrink-0 text-center">負責</div>
            <div className="w-12 shrink-0 text-center">參與</div>
            <div className="w-12 shrink-0 text-center">週報</div>
            <div className="flex-1" />
            <div className="w-9 shrink-0" />
          </div>

          {/* 列 */}
          <div ref={listRef} className="divide-y">
            {pageItems.length === 0 ? (
              <div className="text-muted-foreground px-3 py-10 text-center text-sm">
                找不到符合的成員。
              </div>
            ) : (
              pageItems.map((m) => (
                <div
                  key={m.id}
                  className="hover:bg-muted/40 flex items-center gap-3 px-3 py-2"
                >
                  <Link
                    href={`/team/${m.id}`}
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
                        <MemberName u={m} className="min-w-0 text-sm font-medium" />
                        {m.isBoss && (
                          <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        )}
                        {(m.role === "OWNER" || m.role === "ADMIN") && (
                          <span className="shrink-0 rounded bg-violet-100 px-1.5 text-[10px] text-violet-700">
                            {m.role === "OWNER" ? "擁有者" : "管理者"}
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
                  <div className="flex-1" />
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
              ))
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
