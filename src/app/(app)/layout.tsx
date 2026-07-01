import { requireUser } from "@/server/auth-helpers";
import { getAllUsers } from "@/server/queries";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const users = await getAllUsers();

  return (
    <div className="min-h-dvh">
      <AppSidebar user={user} users={users} />
      <main className="lg:pl-60">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
