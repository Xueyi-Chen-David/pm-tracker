import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireActiveOrg } from "@/server/org";
import { getProject, getOrgMemberUsers } from "@/server/queries";
import { ProjectForm } from "@/components/project-form";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { toDateInput } from "@/lib/date";

export const metadata = { title: "編輯專案 · Project Pulse" };

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { org } = await requireActiveOrg();
  const [project, users] = await Promise.all([
    getProject(org.id, id),
    getOrgMemberUsers(org.id),
  ]);
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/projects/${id}`}
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" /> 返回專案
      </Link>
      <PageHeader title="編輯專案 / 任務" />
      <Card>
        <CardContent className="pt-6">
          <ProjectForm
            mode="edit"
            users={users}
            values={{
              id: project.id,
              name: project.name,
              type: project.type,
              status: project.status,
              priority: project.priority,
              health: project.health,
              progress: project.progress,
              ownerId: project.ownerId,
              startDate: toDateInput(project.startDate),
              targetDate: toDateInput(project.targetDate),
              description: project.description,
              color: project.color,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
