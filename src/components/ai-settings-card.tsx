"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Loader2, Sparkles, Trash2 } from "lucide-react";
import { clearOrgGeminiKey, setOrgGeminiKey } from "@/server/actions/ai-settings";
import type { AiSettingsSummary } from "@/server/queries";
import { cn } from "@/lib/utils";
import { AI_FEATURE_LABELS } from "@/lib/ai-features";
import { Button } from "@/components/ui/button";


const nf = new Intl.NumberFormat("zh-TW");

/**
 * AI 設定（應用程式頁）：組織自備 Gemini API key + 本月用量。
 * 平台不提供預設 key；沒設定時名片辨識、包裝辨識、會議總結都不會出現。
 */
export function AiSettingsCard({
  summary,
  canManage,
  memberNames,
}: {
  summary: AiSettingsSummary;
  canManage: boolean;
  memberNames: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(!summary.hasKey);
  const [key, setKey] = useState("");

  const total = summary.month.reduce(
    (a, f) => ({
      calls: a.calls + f.calls,
      input: a.input + f.inputTokens,
      output: a.output + f.outputTokens,
      total: a.total + f.totalTokens,
    }),
    { calls: 0, input: 0, output: 0, total: 0 },
  );

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
      setEditing(true);
      router.refresh();
    });
  }

  return (
    <section className="bg-card mb-6 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-violet-500" /> AI（Gemini）
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            名片辨識、食品包裝辨識、會議記錄總結使用組織自己的 Gemini API key，費用直接計在你們的 Google 帳戶。
            到{" "}
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
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs",
            summary.hasKey ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground",
          )}
        >
          {summary.hasKey ? `已設定 ····${summary.last4 ?? ""}` : "未設定（AI 功能關閉）"}
        </span>
      </div>

      {canManage && (
        <div className="mt-3">
          {editing ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-60 flex-1">
                <KeyRound className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
                <input
                  type="password"
                  autoComplete="off"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="貼上 Gemini API key（AIza…）"
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent pr-2 pl-8 text-sm outline-none focus-visible:ring-[3px]"
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
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setEditing(true)}>
                更換 key
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={remove} className="text-destructive">
                <Trash2 className="h-4 w-4" /> 移除
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 border-t pt-3">
        <div className="mb-2 text-xs font-medium">本月用量</div>
        {summary.month.length === 0 ? (
          <p className="text-muted-foreground text-xs">本月還沒有使用 AI。</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th className="py-1.5 pr-3 font-medium">功能</th>
                <th className="py-1.5 pr-3 text-right font-medium">次數</th>
                <th className="py-1.5 pr-3 text-right font-medium">輸入 tokens</th>
                <th className="py-1.5 pr-3 text-right font-medium">輸出 tokens</th>
                <th className="py-1.5 text-right font-medium">合計 tokens</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {summary.month.map((f) => (
                <tr key={f.feature} className="border-b">
                  <td className="py-1.5 pr-3">{AI_FEATURE_LABELS[f.feature] ?? f.feature}</td>
                  <td className="py-1.5 pr-3 text-right">
                    {nf.format(f.calls)}
                    {f.failed > 0 && (
                      <span className="text-muted-foreground ml-1 text-xs">（失敗 {f.failed}）</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-right">{nf.format(f.inputTokens)}</td>
                  <td className="py-1.5 pr-3 text-right">{nf.format(f.outputTokens)}</td>
                  <td className="py-1.5 text-right">{nf.format(f.totalTokens)}</td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-1.5 pr-3">合計</td>
                <td className="py-1.5 pr-3 text-right">{nf.format(total.calls)}</td>
                <td className="py-1.5 pr-3 text-right">{nf.format(total.input)}</td>
                <td className="py-1.5 pr-3 text-right">{nf.format(total.output)}</td>
                <td className="py-1.5 text-right">{nf.format(total.total)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {summary.recent.length > 0 && (
          <details className="mt-3">
            <summary className="text-muted-foreground cursor-pointer text-xs">最近 20 筆呼叫</summary>
            <ul className="mt-2 space-y-1 text-xs">
              {summary.recent.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-2 tabular-nums">
                  <span className="text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString("zh-TW", { hour12: false })}
                  </span>
                  <span>{AI_FEATURE_LABELS[r.feature] ?? r.feature}</span>
                  <span className="text-muted-foreground">
                    {r.userId ? (memberNames[r.userId] ?? "—") : "—"}
                  </span>
                  <span>{nf.format(r.totalTokens)} tokens</span>
                  {!r.ok && <span className="text-destructive">失敗：{r.error}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
