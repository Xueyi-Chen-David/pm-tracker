import { cn } from "@/lib/utils";
import type { StageView } from "@/components/crm/types";

/**
 * 「階段歷程」的橫向步驟條：一眼看出目前商機走到管線的哪一步。目前階段是實心大圓，
 * 之前的階段是半透明小圓，之後的是空心小圓，中間用線連起來。
 *
 * 用 --primary（App 實際的單色主色，不是 stage 各自的自訂色）標示「目前位置」——
 * stage.color 是每個階段自己的識別色，各處（看板卡片、下面的詳細歷程）已經在用；
 * 這裡要表達的是另一件事：「選取 / 目前」狀態，兩者概念不同，混在一起顏色反而看不出重點。
 *
 * 階段可能很多（組織自訂），窄的側欄放不下就橫向捲動，不強行擠壓或換行。
 */
export function StageStepper({
  stages,
  currentStage,
}: {
  stages: StageView[];
  currentStage: string;
}) {
  if (stages.length === 0) return null;
  const idx = stages.findIndex((s) => s.key === currentStage);

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex w-max items-start">
        {stages.map((s, i) => {
          const isCurrent = s.key === currentStage;
          const isPast = idx >= 0 && i < idx;
          return (
            <div key={s.key} className="flex items-start">
              <div className="flex w-14 flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "mt-[3px] shrink-0 rounded-full border-2",
                    isCurrent
                      ? "border-primary bg-primary h-3.5 w-3.5"
                      : isPast
                        ? "border-primary/40 bg-primary/40 h-2.5 w-2.5"
                        : "border-muted-foreground/25 bg-background h-2.5 w-2.5",
                  )}
                />
                <span
                  className={cn(
                    "max-w-14 truncate text-center text-[10px] leading-tight",
                    isCurrent
                      ? "text-foreground font-medium"
                      : "text-muted-foreground",
                  )}
                  title={s.label}
                >
                  {s.label}
                </span>
              </div>
              {i < stages.length - 1 && (
                <div
                  className={cn(
                    "mt-[10px] h-px w-4 shrink-0",
                    isPast ? "bg-primary/40" : "bg-muted-foreground/20",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
