"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, Wand2 } from "lucide-react";
import { convert } from "@/lib/foodlabel/engine";
import { SAMPLES } from "@/lib/foodlabel/samples";
import { JP_FIELD_LABELS } from "@/lib/foodlabel/nutrients";
import { REGULATIONS, DEFAULT_REGULATION_ID } from "@/lib/foodlabel/regulations";
import type { JpNutrientKey } from "@/lib/foodlabel/types";
import { saveConversion } from "@/server/actions/foodlabel";
import { NutritionLabel } from "@/components/foodlabel/nutrition-label";
import { IssueList } from "@/components/foodlabel/issue-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type DealOption = { id: string; title: string };

const NONE = "__none__";

/**
 * 轉換工作台。
 *
 * 預覽在瀏覽器端跑同一份純函式引擎（即時、不用來回伺服器）；按下「轉換並存檔」時
 * 伺服器會**重新算一次**才寫入資料庫——合規結論不能由瀏覽器決定。
 */
export function FoodLabelWorkbench({ deals }: { deals: DealOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [name, setName] = useState("");
  const [nameZh, setNameZh] = useState("");
  const [supplier, setSupplier] = useState("");
  const [state, setState] = useState<"solid" | "liquid">("solid");
  const [servingSize, setServingSize] = useState("");
  const [packageSize, setPackageSize] = useState("");
  const [dealId, setDealId] = useState<string>(NONE);
  const [regulationId, setRegulationId] = useState(DEFAULT_REGULATION_ID);
  const [basisOverride, setBasisOverride] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [format, setFormat] = useState<"dv" | "per100">("per100");

  const result = useMemo(() => {
    if (!sourceText.trim()) return null;
    return convert({
      sourceText,
      regulationId,
      product: {
        productName: nameZh || name,
        servingSize: servingSize ? Number(servingSize) : null,
        packageSize: packageSize ? Number(packageSize) : null,
        state,
      },
      basisOverride: basisOverride
        ? { amount: Number(basisOverride), unit: state === "liquid" ? "ml" : "g" }
        : null,
    });
  }, [
    sourceText,
    regulationId,
    name,
    nameZh,
    servingSize,
    packageSize,
    state,
    basisOverride,
  ]);

  const errorCount = result?.issues.filter((i) => i.level === "error").length ?? 0;
  const warnCount = result?.issues.filter((i) => i.level === "warning").length ?? 0;

  function loadSample(i: number) {
    const s = SAMPLES[i];
    setSourceText(s.text);
    setName(s.product.productName);
    setNameZh("");
    setServingSize(s.product.servingSize ? String(s.product.servingSize) : "");
    setPackageSize(s.product.packageSize ? String(s.product.packageSize) : "");
    setState(s.product.state ?? "solid");
    setBasisOverride("");
  }

  function save() {
    if (!name.trim()) {
      toast.error("請輸入商品名稱");
      return;
    }
    if (!sourceText.trim()) {
      toast.error("請貼上日本營養成分表示");
      return;
    }
    start(async () => {
      try {
        const res = await saveConversion({
          name,
          nameZh: nameZh || undefined,
          supplier: supplier || undefined,
          state,
          servingSize: servingSize ? Number(servingSize) : null,
          packageSize: packageSize ? Number(packageSize) : null,
          crmDealId: dealId === NONE ? null : dealId,
          sourceText,
          regulationId,
          basisOverride: basisOverride ? Number(basisOverride) : null,
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("已存檔");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "存檔失敗");
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(320px,400px)_1fr]">
      {/* ── 輸入 ───────────────────────────── */}
      <div className="space-y-4">
        <section className="bg-card rounded-lg border p-4">
          <h2 className="mb-3 text-sm font-semibold">1. 商品資訊</h2>
          <div className="space-y-3">
            <Field label="商品名稱（日文原名）" required>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="チョコチップクッキー"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="中文品名">
                <Input
                  value={nameZh}
                  onChange={(e) => setNameZh(e.target.value)}
                  placeholder="巧克力豆餅乾"
                />
              </Field>
              <Field label="日本供應商">
                <Input
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="○○製菓"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="型態">
                <Select
                  value={state}
                  onValueChange={(v) =>
                    typeof v === "string" && setState(v as "solid" | "liquid")
                  }
                >
                  <SelectTrigger>
                    <SelectValue>
                      {(v: string) =>
                        v === "liquid" ? "液體（毫升）" : "固體（公克）"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solid">固體 / 半固體（公克）</SelectItem>
                    <SelectItem value="liquid">液體（毫升）</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="法規版本">
                <Select
                  value={regulationId}
                  onValueChange={(v) => typeof v === "string" && setRegulationId(v)}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {(v: string) => REGULATIONS[v]?.effectiveFrom ?? v}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(REGULATIONS).map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.effectiveFrom} 施行
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`每一份量（${state === "liquid" ? "毫升" : "公克"}）`}>
                <Input
                  type="number"
                  value={servingSize}
                  onChange={(e) => setServingSize(e.target.value)}
                  placeholder="30"
                />
              </Field>
              <Field label={`包裝總${state === "liquid" ? "容量" : "淨重"}`}>
                <Input
                  type="number"
                  value={packageSize}
                  onChange={(e) => setPackageSize(e.target.value)}
                  placeholder="180"
                />
              </Field>
            </div>
            {deals.length > 0 && (
              <Field label="關聯 CRM 商機（選填）">
                <Select
                  value={dealId}
                  onValueChange={(v) => typeof v === "string" && setDealId(v)}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {(v: string) =>
                        v === NONE
                          ? "不關聯"
                          : (deals.find((d) => d.id === v)?.title ?? v)
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>不關聯</SelectItem>
                    {deals.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field label="原標示基準覆寫（選填，留空＝自動判讀「〜当たり」）">
              <Input
                type="number"
                value={basisOverride}
                onChange={(e) => setBasisOverride(e.target.value)}
                placeholder="例：原標示為每 100 就填 100"
              />
            </Field>
          </div>
        </section>

        <section className="bg-card rounded-lg border p-4">
          <h2 className="mb-3 text-sm font-semibold">2. 日本營養成分表示</h2>
          <Textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            spellCheck={false}
            rows={10}
            className="font-mono text-[13px]"
            placeholder={
              "栄養成分表示（100g当たり）\nエネルギー 350kcal\nたんぱく質 8.2g\n脂質 12.5g\n炭水化物 50.2g\n食塩相当量 1.2g"
            }
          />
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {SAMPLES.map((s, i) => (
              <Button
                key={s.name}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                title={s.hint}
                onClick={() => loadSample(i)}
              >
                <Wand2 className="h-3 w-3" /> {s.name}
              </Button>
            ))}
          </div>
          <Button className="mt-3 w-full" disabled={pending} onClick={save}>
            <Save className="h-4 w-4" /> 轉換並存檔
          </Button>
        </section>
      </div>

      {/* ── 結果 ───────────────────────────── */}
      <div className="bg-card rounded-lg border p-4">
        {!result ? (
          <div className="text-muted-foreground flex h-full min-h-60 items-center justify-center px-6 text-center text-sm">
            貼上日本標示後，這裡會即時顯示台灣營養標示、合規缺口與逐步換算過程。
          </div>
        ) : (
          <Tabs defaultValue="label">
            <TabsList variant="line" className="w-max">
              <TabsTrigger value="label">台灣營養標示</TabsTrigger>
              <TabsTrigger value="issues">
                合規檢查
                {errorCount > 0 ? (
                  <span className="bg-destructive ml-1 rounded-full px-1.5 text-[11px] text-white">
                    {errorCount}
                  </span>
                ) : warnCount > 0 ? (
                  <span className="bg-muted text-muted-foreground ml-1 rounded-full px-1.5 text-[11px]">
                    {warnCount}
                  </span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="trace">換算過程</TabsTrigger>
              <TabsTrigger value="parsed">原始解析</TabsTrigger>
            </TabsList>

            <TabsContent value="label" className="mt-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setFormat(format === "dv" ? "per100" : "dv")}
                >
                  切換格式：
                  {format === "dv" ? "每份＋每日參考值%" : "每份＋每100"}
                </Button>
                <Badge variant="outline">{result.label.regulationVersion}</Badge>
              </div>
              <div className="flex flex-wrap gap-5">
                <NutritionLabel label={result.label} format={format} />
                <div className="min-w-70 flex-1">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-b text-xs">
                        <th className="py-1.5 text-left font-medium">營養素</th>
                        <th className="py-1.5 text-right font-medium">
                          每100（未修整）
                        </th>
                        <th className="py-1.5 text-right font-medium">
                          每份（未修整）
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.label.rows.map((r) => (
                        <tr key={r.key} className="border-b last:border-0">
                          <td className="py-1.5">
                            {r.indent === 1 ? "　└ " : ""}
                            {r.label}
                            {r.zeroDeclared && (
                              <Badge variant="outline" className="ml-1.5 text-[10px]">
                                得以0標示
                              </Badge>
                            )}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {r.rawPer100 === null ? "—" : r.rawPer100.toFixed(3)}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {r.rawPerServing === null
                              ? "—"
                              : r.rawPerServing.toFixed(3)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-muted-foreground mt-2.5 text-xs">
                    左邊是可交付印製的標示；右表為修整前的計算值，供稽核與送驗比對。
                  </p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="issues" className="mt-4">
              <IssueList issues={result.issues} />
            </TabsContent>

            <TabsContent value="trace" className="mt-4">
              <ol className="space-y-3">
                {result.trace.map((t, i) => (
                  <li key={i}>
                    <p className="text-sm font-semibold">{t.step}</p>
                    <p className="text-muted-foreground text-sm">{t.detail}</p>
                    {t.formula && (
                      <pre className="bg-muted mt-1 overflow-x-auto rounded-md border p-2 font-mono text-xs">
                        {t.formula}
                      </pre>
                    )}
                  </li>
                ))}
                {result.label.notes.length > 0 && (
                  <li>
                    <p className="text-sm font-semibold">轉換備註</p>
                    <ul className="text-muted-foreground mt-1 list-disc space-y-0.5 pl-5 text-sm">
                      {result.label.notes.map((n, i) => (
                        <li key={i}>{n.message}</li>
                      ))}
                    </ul>
                  </li>
                )}
              </ol>
            </TabsContent>

            <TabsContent value="parsed" className="mt-4">
              <p className="text-muted-foreground mb-3 text-sm">
                偵測基準：{result.parsed.basisRaw ?? "（未偵測到）"} →{" "}
                {result.parsed.basisType}
                {result.parsed.basisAmount
                  ? `　每 ${result.parsed.basisAmount} ${result.parsed.basisUnit ?? ""}`
                  : ""}
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-xs">
                    <th className="py-1.5 text-left font-medium">日本欄位</th>
                    <th className="py-1.5 text-right font-medium">數值</th>
                    <th className="py-1.5 text-left font-medium">原文擷取</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.parsed.jp).map(([k, v]) => (
                    <tr key={k} className="border-b last:border-0">
                      <td className="py-1.5">
                        {JP_FIELD_LABELS[k as JpNutrientKey] ?? k}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {v.value.toFixed(2)} {v.unit}
                      </td>
                      <td className="text-muted-foreground py-1.5">
                        {v.raw}
                        {v.qualifier ? `（${v.qualifier}）` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.parsed.unrecognizedLines.length > 0 && (
                <>
                  <p className="text-muted-foreground mt-4 text-xs">
                    未辨識的行（可能是其他營養素或包裝雜訊）：
                  </p>
                  <pre className="bg-muted mt-1 overflow-x-auto rounded-md border p-2 font-mono text-xs">
                    {result.parsed.unrecognizedLines.join("\n")}
                  </pre>
                </>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-muted-foreground mb-1 text-xs font-medium">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}
