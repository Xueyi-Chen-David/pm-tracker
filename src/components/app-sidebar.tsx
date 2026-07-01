"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  FolderKanban,
  CalendarRange,
  FileText,
  Users,
  UserCheck,
  NotebookPen,
  Menu,
  LogOut,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { displayInitial } from "@/lib/display";
import { MemberName } from "@/components/member-name";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { NewProjectButton } from "@/components/new-project-button";
import { OrgSwitcher } from "@/components/org-switcher";
import type { ModuleKey } from "@/lib/modules";

const NAV: { key: ModuleKey; href: string; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "dashboard", href: "/dashboard", label: "總覽", icon: LayoutDashboard },
  { key: "projects", href: "/projects", label: "專案與任務", icon: FolderKanban },
  { key: "timeline", href: "/timeline", label: "時程藍圖", icon: CalendarRange },
  { key: "team", href: "/team", label: "團隊", icon: Users },
  { key: "attendance", href: "/attendance", label: "出席狀況", icon: UserCheck },
  { key: "meetings", href: "/meetings", label: "會議記錄", icon: NotebookPen },
  { key: "report", href: "/report", label: "週報", icon: FileText },
];

type SessionUser = {
  name?: string | null;
  nickname?: string | null;
  useNickname?: boolean;
  email?: string | null;
  image?: string | null;
  isBoss?: boolean;
};

type UserOption = { id: string; name: string | null; email: string | null };

type Org = { id: string; name: string };

function NavLinks({
  onNavigate,
  moduleKeys,
}: {
  onNavigate?: () => void;
  moduleKeys: ModuleKey[];
}) {
  const pathname = usePathname();
  const allowed = new Set(moduleKeys);
  return (
    <nav className="flex flex-col gap-1">
      {NAV.filter((item) => allowed.has(item.key)).map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4.5 w-4.5 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-2">
      <div className="bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold">
        P
      </div>
      <div className="leading-tight">
        <div className="text-sm font-bold">Project Pulse</div>
        <div className="text-muted-foreground text-[11px]">專案儀表板</div>
      </div>
    </Link>
  );
}

function UserCard({ user }: { user: SessionUser }) {
  const initials = displayInitial(user);
  return (
    <div className="flex items-center gap-2.5 rounded-lg border p-2">
      <Avatar className="h-8 w-8">
        {user.image && <AvatarImage src={user.image} alt="" />}
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center text-sm font-medium">
          <MemberName u={user} className="min-w-0" />
          {user.isBoss && (
            <span className="shrink-0 text-amber-600">&nbsp;· 老闆</span>
          )}
        </div>
        <div className="text-muted-foreground truncate text-[11px]">
          {user.email}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        title="登出"
        onClick={() => signOut({ redirectTo: "/login" })}
      >
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function AppSidebar({
  user,
  users,
  moduleKeys,
  activeOrg,
  orgs,
}: {
  user: SessionUser;
  users: UserOption[];
  moduleKeys: ModuleKey[];
  activeOrg: Org;
  orgs: Org[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* 桌機固定側欄 */}
      <aside className="bg-card no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col gap-4 border-r p-3 lg:flex">
        <div className="pt-2">
          <Brand />
        </div>
        <div className="px-1">
          <OrgSwitcher activeOrg={activeOrg} orgs={orgs} />
        </div>
        <NewProjectButton
          users={users}
          trigger={
            <Button size="sm" className="mx-1 w-[calc(100%-0.5rem)] gap-1.5">
              <Plus className="h-4 w-4" /> 新增專案 / 任務
            </Button>
          }
        />
        <div className="px-1">
          <NavLinks moduleKeys={moduleKeys} />
        </div>
        <div className="mt-auto">
          <UserCard user={user} />
        </div>
      </aside>

      {/* 手機頂部列 + 抽屜 */}
      <header className="bg-card no-print sticky top-0 z-30 flex items-center justify-between border-b px-4 py-2.5 lg:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          <NewProjectButton
            users={users}
            trigger={
              <Button variant="ghost" size="icon" title="新增專案 / 任務">
                <Plus className="h-5 w-5" />
              </Button>
            }
          />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
            >
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-3">
              <SheetTitle className="sr-only">導覽選單</SheetTitle>
              <div className="mt-6 flex h-full flex-col gap-4">
                <OrgSwitcher activeOrg={activeOrg} orgs={orgs} />
                <NavLinks moduleKeys={moduleKeys} onNavigate={() => setOpen(false)} />
                <div className="mt-auto">
                  <UserCard user={user} />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>
    </>
  );
}
