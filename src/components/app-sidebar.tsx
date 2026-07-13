"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Building2,
  FolderKanban,
  CalendarRange,
  FileText,
  Users,
  UserCheck,
  Library,
  NotebookPen,
  ClipboardList,
  CircleUser,
  Handshake,
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
import { NotificationBell, type NotificationItem } from "@/components/notification-bell";
import { ViewAsToggle } from "@/components/view-as-toggle";
import type { ModuleKey } from "@/lib/modules";

type NavItem = {
  key: ModuleKey;
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

type NavSection = {
  /** 區塊小標題；省略＝置頂區塊（總覽），不顯示標題、也不加分隔線。 */
  title?: string;
  items: NavItem[];
};

// 側欄依功能分群，讓「專案 / 公司管理 / 業務 / 個人」一眼可辨，不再是一長串平面清單。
// 順序＝顯示順序；區塊內某頁被權限擋掉會自動略過，整區都被擋掉則連標題與分隔線一起省略。
const NAV_SECTIONS: NavSection[] = [
  // 置頂：總覽（無標題、無分隔線）。
  {
    items: [
      { key: "dashboard", href: "/dashboard", label: "總覽", icon: LayoutDashboard },
    ],
  },
  // 目標與專案：從公司 OKR 目標，到時程藍圖，再到落地的專案與任務。
  {
    title: "目標與專案",
    items: [
      { key: "company", href: "/company", label: "公司OKR", icon: Building2 },
      { key: "timeline", href: "/timeline", label: "時程藍圖", icon: CalendarRange },
      { key: "projects", href: "/projects", label: "專案與任務", icon: FolderKanban },
    ],
  },
  // 團隊協作：會議、團隊、出席，週報靠近底部，公司文件置於最底。
  {
    title: "團隊協作",
    items: [
      { key: "meetings", href: "/meetings", label: "會議記錄", icon: NotebookPen },
      { key: "team", href: "/team", label: "團隊", icon: Users },
      { key: "attendance", href: "/attendance", label: "出席狀況", icon: UserCheck },
      { key: "report", href: "/report", label: "週報", icon: FileText },
      { key: "training", href: "/training", label: "公司文件", icon: Library },
    ],
  },
  // 業務：客戶關係。
  {
    title: "業務",
    items: [{ key: "crm", href: "/crm", label: "CRM", icon: Handshake }],
  },
  // 個人：每個人自己的資料。
  {
    title: "個人",
    items: [
      { key: "daily", href: "/daily", label: "每日報告", icon: ClipboardList },
      { key: "me", href: "/me", label: "個人資料", icon: CircleUser },
    ],
  },
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

  const renderItem = (item: NavItem) => {
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
  };

  // 依權限過濾後，只保留仍有可見頁面的區塊（避免留下孤立的標題 / 分隔線）。
  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => allowed.has(item.key)),
  })).filter((section) => section.items.length > 0);

  return (
    <nav className="flex flex-col gap-1">
      {sections.map((section, index) => (
        <div key={section.title ?? "__top"} className="flex flex-col gap-1">
          {index > 0 && <div className="my-2 border-t" />}
          {section.title && (
            <div className="text-muted-foreground px-3 pb-1 text-[11px] font-semibold tracking-wide">
              {section.title}
            </div>
          )}
          {section.items.map(renderItem)}
        </div>
      ))}
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
  canPreviewAsEmployee,
  previewingAsEmployee,
  notifications,
  unread,
}: {
  user: SessionUser;
  users: UserOption[];
  moduleKeys: ModuleKey[];
  activeOrg: Org;
  orgs: Org[];
  canPreviewAsEmployee: boolean;
  previewingAsEmployee: boolean;
  notifications: NotificationItem[];
  unread: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* 桌機固定側欄 */}
      <aside className="bg-card no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col gap-4 border-r p-3 lg:flex">
        <div className="flex items-center justify-between pt-2">
          <Brand />
          <NotificationBell items={notifications} unread={unread} />
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
        {canPreviewAsEmployee && (
          <div className="px-1">
            <ViewAsToggle previewing={previewingAsEmployee} />
          </div>
        )}
        <div className="mt-auto">
          <UserCard user={user} />
        </div>
      </aside>

      {/* 手機頂部列 + 抽屜 */}
      <header className="bg-card no-print sticky top-0 z-30 flex items-center justify-between border-b px-4 py-2.5 lg:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          <NotificationBell items={notifications} unread={unread} />
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
                {canPreviewAsEmployee && (
                  <ViewAsToggle previewing={previewingAsEmployee} />
                )}
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
