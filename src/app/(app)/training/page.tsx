import { requireManageContext } from "@/server/org";
import { getTrainingDocs, getOrgMemberUsers } from "@/server/queries";
import { PageHeader } from "@/components/page-header";
import { DocsWorkspace } from "@/components/training/docs-workspace";

export const metadata = { title: "公司文件 · Project Pulse" };

export default async function TrainingPage() {
  const { org, user, canManage } = await requireManageContext();
  const [{ folders, pages }, members] = await Promise.all([
    getTrainingDocs(org.id, user.id, canManage),
    getOrgMemberUsers(org.id),
  ]);

  return (
    <div className="flex flex-col gap-5 lg:h-full lg:min-h-0">
      <PageHeader
        title="公司文件"
        description="以資料夾整理的公司文件庫，內容以 Markdown 撰寫。"
      />
      <DocsWorkspace
        folders={folders}
        pages={pages}
        members={members}
        canManage={canManage}
      />
    </div>
  );
}
