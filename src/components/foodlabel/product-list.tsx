"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, ChevronDown } from "lucide-react";
import { deleteProduct } from "@/server/actions/foodlabel";
import type { ConversionResult } from "@/lib/foodlabel/types";
import { NutritionLabel } from "@/components/foodlabel/nutrition-label";
import { IssueList } from "@/components/foodlabel/issue-list";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ProductRow = {
  id: string;
  name: string;
  nameZh: string | null;
  supplier: string | null;
  dealTitle: string | null;
  conversionCount: number;
  latest: {
    id: string;
    createdAt: string;
    errorCount: number;
    warningCount: number;
    regulationId: string;
    result: ConversionResult;
  } | null;
};

/** 已建立的輸台商品清單；展開可看最近一次轉換的標示與合規缺口。 */
export function ProductList({ products }: { products: ProductRow[] }) {
  if (products.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        尚無商品。在上方轉換後按「轉換並存檔」，就會留存為一支輸台商品。
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

function ProductCard({ product: p }: { product: ProductRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="bg-card rounded-lg border">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <button
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown
            className={cn(
              "text-muted-foreground h-4 w-4 shrink-0 transition-transform",
              open && "rotate-180",
            )}
          />
          <span className="min-w-0">
            <span className="block truncate font-medium">
              {p.nameZh || p.name}
            </span>
            <span className="text-muted-foreground block truncate text-xs">
              {p.nameZh ? `${p.name}　` : ""}
              {p.supplier ? `${p.supplier}　` : ""}
              {p.conversionCount} 次轉換
              {p.dealTitle ? `　· 商機：${p.dealTitle}` : ""}
            </span>
          </span>
        </button>

        {p.latest &&
          (p.latest.errorCount > 0 ? (
            <Badge variant="destructive">{p.latest.errorCount} 項不合規</Badge>
          ) : (
            <Badge variant="secondary">強制項目齊備</Badge>
          ))}

        <Button
          variant="ghost"
          size="icon-sm"
          title="刪除商品"
          disabled={pending}
          className="text-muted-foreground hover:text-destructive"
          onClick={() => {
            if (
              !confirm(
                `確定刪除「${p.nameZh || p.name}」嗎？\n該商品的 ${p.conversionCount} 筆轉換紀錄會一併刪除，此動作無法復原。`,
              )
            )
              return;
            start(async () => {
              try {
                await deleteProduct(p.id);
                toast.success("已刪除商品");
                router.refresh();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "刪除失敗");
              }
            });
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {open && p.latest && (
        <div className="space-y-4 border-t p-4">
          <p className="text-muted-foreground text-xs">
            最近一次轉換：
            {new Date(p.latest.createdAt).toLocaleString("zh-TW")}　·　法規版本{" "}
            {p.latest.regulationId}
          </p>
          <div className="flex flex-wrap gap-5">
            <NutritionLabel label={p.latest.result.label} format="per100" />
            <div className="min-w-70 flex-1">
              <IssueList issues={p.latest.result.issues} />
            </div>
          </div>
        </div>
      )}
      {open && !p.latest && (
        <p className="text-muted-foreground border-t p-4 text-sm">
          這支商品還沒有轉換紀錄。
        </p>
      )}
    </div>
  );
}
