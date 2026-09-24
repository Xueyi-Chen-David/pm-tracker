import { db } from "@/server/db";
import { requireActiveOrg, getInstalledModuleKeys } from "@/server/org";
import { isAiEnabled } from "@/server/gemini";
import type { ConversionResult } from "@/lib/foodlabel/types";
import { PageHeader } from "@/components/page-header";
import { FoodLabelWorkbench } from "@/components/foodlabel/workbench";
import { ProductList, type ProductRow } from "@/components/foodlabel/product-list";

export const metadata = { title: "食品標示 · Project Pulse" };

export default async function FoodLabelPage() {
  const { org } = await requireActiveOrg();

  const [products, installed] = await Promise.all([
    db.foodLabelProduct.findMany({
      where: { organizationId: org.id },
      orderBy: { updatedAt: "desc" },
      include: {
        crmDeal: { select: { title: true } },
        _count: { select: { conversions: true } },
        // 只帶最近一次轉換：清單頁不需要完整歷史。
        conversions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            createdAt: true,
            errorCount: true,
            warningCount: true,
            regulationId: true,
            resultJson: true,
          },
        },
      },
    }),
    getInstalledModuleKeys(org.id),
  ]);

  // CRM 沒安裝就不提供商機關聯（欄位仍在，只是介面上不出現）。
  const deals = installed.includes("crm")
    ? await db.crmDeal.findMany({
        where: { organizationId: org.id, status: "OPEN" },
        select: { id: true, title: true },
        orderBy: { updatedAt: "desc" },
        take: 100,
      })
    : [];

  const rows: ProductRow[] = products.map((p) => {
    const latest = p.conversions[0];
    return {
      id: p.id,
      name: p.name,
      nameZh: p.nameZh,
      supplier: p.supplier,
      dealTitle: p.crmDeal?.title ?? null,
      conversionCount: p._count.conversions,
      latest: latest
        ? {
            id: latest.id,
            createdAt: latest.createdAt.toISOString(),
            errorCount: latest.errorCount,
            warningCount: latest.warningCount,
            regulationId: latest.regulationId,
            result: latest.resultJson as unknown as ConversionResult,
          }
        : null,
    };
  });

  const blocked = rows.filter((r) => (r.latest?.errorCount ?? 0) > 0).length;

  return (
    <div>
      <PageHeader
        title="食品標示"
        description={
          rows.length === 0
            ? "把日本「栄養成分表示」轉換成台灣的營養標示，並列出強制項目的缺口。"
            : `共 ${rows.length} 支輸台商品，其中 ${blocked} 支尚有強制項目未補齊。`
        }
      />
      <FoodLabelWorkbench deals={deals} aiEnabled={await isAiEnabled(org.id)} />
      <h2 className="mt-8 mb-3 text-sm font-semibold">輸台商品</h2>
      <ProductList products={rows} />
    </div>
  );
}
