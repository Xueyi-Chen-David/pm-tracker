import { requireUser } from "@/server/auth-helpers";
import { getAllUsers } from "@/server/queries";
import { ProjectForm } from "@/components/project-form";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "新增專案 · Project Pulse" };

export default async function NewProjectPage() {
  await requireUser();
  const users = await getAllUsers();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="新增專案 / 任務"
        description="可建立常態型、專案型或一次性任務，並指派負責人。"
      />
      <Card>
        <CardContent className="pt-6">
          <ProjectForm mode="create" users={users} />
        </CardContent>
      </Card>
    </div>
  );
}
