"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, KeyRound, Loader2, Sparkles, Trash2 } from "lucide-react";
import { clearOrgGeminiKey, setOrgGeminiKey } from "@/server/actions/ai-settings";
import type { AiSettingsSummary } from "@/server/queries";
import { cn } from "@/lib/utils";
import { AI_FEATURE_LABELS } from "@/lib/ai-features";
import { USD_TO_TWD, formatTwd, formatUsd } from "@/lib/ai-pricing";
import { Button } from "@/components/ui/button";
import { AttendanceMonthNav } from "@/components/attendance-month-nav";

const nf = new Intl.NumberFormat("zh-TW");

/**
 * AI 設定（應用程式頁）：組織自備 Gemini API key + 每月用量與費用。
 * 平台不提供預設 key；沒設定時名片辨識、包裝辨識、會議總結都不會出現。
 * 逐筆明細預設收起，避免頁面太長。
 */
export function AiSettingsCard({
  summary,
  canManage,
  memberNames,
  thisMonth,
}: {
  summary: AiSettingsSummary;
  canManage: boolean;
  memberNames: Record<string, string>;
  thisMonth: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");

  const total = summary.features.reduce(
    (a, f) => ({
      calls: a.calls + f.calls,
      failed: a.failed + f.failed,
      tokens: a.tokens + f.totalTokens,
      cost: a.cost + f.costUsd,
    }),
    { calls: 0, failed: 0, tokens: 0, cost: 0 },
  );
  const [yy, mm] = summary.month.split("-").map(Number);

  function save() {
    start(async () => {
      const res = await setOrgGeminiKey(key);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("已儲存 Gemini API key");
      setKey("");
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm("確定移除 API key？移除後 AI 功能會立即關閉。")) return;
    start(async () => {
      await clearOrgGeminiKey();
      toast.success("已移除 API key");
      router.refresh();
    });
  }

  const showForm = canManage && (editing || !summary.hasKey);

  return (
    <section className="bg-card mb-6 overflow-hidden rounded-xl border">
      {/* 標題 + key 狀態 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-violet-500" /> AI 用量與費用
        </h2>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs",
              summary.hasKey ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground",
            )}
          >
            {summary.hasKey ? `Gemini key ····${summary.last4 ?? ""}` : "未設定 key（AI 功能關閉）"}
          </span>
          {canManage && summary.hasKey && !editing && (
            <>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={pending} onClick={() => setEditing(true)}>
                更換
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive h-7 px-2 text-xs"
                disabled={pending}
                onClick={remove}
              >
                <Trash2 className="h-3.5 w-3.5" /> 移除
              </Button>
            </>
          )}
        </div>
      </div>

      {showForm && (
        <div className="bg-muted/30 space-y-2 border-b px-4 py-3">
          <p className="text-muted-foreground text-xs">
            名片辨識、食品包裝辨識、會議記錄總結使用組織自己的 Gemini API key，費用直接計在你們的 Google 帳戶。到{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Google AI Studio
            </a>{" "}
            建立 key。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-60 flex-1">
              <KeyRound className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
              <input
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="貼上 Gemini API key（AIza…）"
                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border pr-2 pl-8 text-sm outline-none focus-visible:ring-[3px]"
              />
            </div>
            <Button size="sm" disabled={pending || !key.trim()} onClick={save}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              驗證並儲存
            </Button>
            {summary.hasKey && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(false)}>
                取消
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="space-y-4 px-4 py-4">
        {/* 月份切換 */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <AttendanceMonthNav month={summary.month} thisMonth={thisMonth} basePath="/apps" />
          <span className="text-muted-foreground text-[11px]">
            台幣以 1 USD ≈ {USD_TO_TWD} TWD 估算，實際以 Google 帳單為準
          </span>
        </div>

        {/* 當月總覽 */}
        <div className="grid grid-cols-3 gap-3">
          <Stat label={`${yy} 年 ${mm} 月費用`} value={formatTwd(total.cost)} sub={formatUsd(total.cost)} />
          <Stat
            label="呼叫次數"
            value={nf.format(total.calls)}
            sub={total.failed > 0 ? `失敗 ${total.failed} 次` : "全部成功"}
          />
          <Stat label="Tokens" value={nf.format(total.tokens)} sub="輸入 + 輸出" />
        </div>

        {/* 各功能 */}
        {summary.features.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed py-6 text-center text-xs">
            這個月沒有使用 AI。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="py-1.5 pr-3 font-medium">功能</th>
                  <th className="py-1.5 pr-3 text-right font-medium">次數</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Tokens</th>
                  <th className="py-1.5 text-right font-medium">費用</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {summary.features.map((f) => (
                  <tr key={f.feature} className="border-b last:border-0">
                    <td className="py-2 pr-3">{AI_FEATURE_LABELS[f.feature] ?? f.feature}</td>
                    <td className="py-2 pr-3 text-right">
                      {nf.format(f.calls)}
                      {f.failed > 0 && (
                        <span className="text-muted-foreground ml-1 text-xs">（失敗 {f.failed}）</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right">{nf.format(f.totalTokens)}</td>
                    <td className="py-2 text-right">
                      {formatTwd(f.costUsd)}
                      <span className="text-muted-foreground ml-1 text-xs">{formatUsd(f.costUsd)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 近 6 個月 */}
        <div>
          <div className="text-muted-foreground mb-1.5 text-xs">近 6 個月費用</div>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {summary.trend.map((t) => (
              <a
                key={t.month}
                href={`/apps?month=${t.month}`}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-center tabular-nums transition-colors",
                  t.month === summary.month ? "border-primary bg-primary/5" : "hover:bg-muted",
                )}
              >
                <div className="text-muted-foreground text-[11px]">{Number(t.month.slice(5))} 月</div>
                <div className="text-xs font-medium">{formatTwd(t.costUsd)}</div>
              </a>
            ))}
          </div>
        </div>

        {/* 逐筆明細：預設收起 */}
        {summary.records.length > 0 && (
          <details className="group rounded-lg border">
            <summary className="hover:bg-muted/50 flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium">
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
              逐筆明細（{summary.records.length} 筆
              {summary.records.length >= 500 ? "，只列最近 500 筆" : ""}）
            </summary>
            <div className="max-h-80 overflow-auto border-t">
              <table className="w-full text-xs">
                <thead className="bg-muted/60 sticky top-0">
                  <tr className="text-muted-foreground text-left">
                    <th className="px-3 py-1.5 font-medium">時間</th>
                    <th className="px-3 py-1.5 font-medium">功能</th>
                    <th className="px-3 py-1.5 font-medium">使用者</th>
                    <th className="px-3 py-1.5 text-right font-medium">Tokens</th>
                    <th className="px-3 py-1.5 text-right font-medium">費用</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {summary.records.map((r) => (
                    <tr key={r.id} className="border-t align-top">
                      <td className="text-muted-foreground px-3 py-1.5 whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleString("zh-TW", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })}
                      </td>
                      <td className="px-3 py-1.5">
                        {AI_FEATURE_LABELS[r.feature] ?? r.feature}
                        {!r.ok && (
                          <div className="text-destructive max-w-72 truncate" title={r.error ?? ""}>
                            失敗：{r.error}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-1.5">{r.userId ? (memberNames[r.userId] ?? "—") : "—"}</td>
                      <td className="px-3 py-1.5 text-right">{nf.format(r.totalTokens)}</td>
                      <td className="px-3 py-1.5 text-right">{formatUsd(r.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-muted/30 rounded-lg border px-3 py-2">
      <div className="text-muted-foreground text-[11px]">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-muted-foreground text-[11px] tabular-nums">{sub}</div>
    </div>
  );
}
