import { requireUser } from "@/server/auth-helpers";
import { getAllUsers } from "@/server/queries";
import { db } from "@/server/db";
import { visibleModules } from "@/lib/modules";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const users = await getAllUsers();

  // 依細分權限決定側欄要顯示哪些模組（老闆 / allowedModules 為空＝全部）。
  const access = await db.user.findUnique({
    where: { id: user.id },
    select: { isBoss: true, allowedModules: true },
  });
  const moduleKeys = visibleModules(access ?? {}).map((m) => m.key);

  return (
    <div className="min-h-dvh">
      <AppSidebar user={user} users={users} moduleKeys={moduleKeys} />
      <main className="lg:pl-60">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
