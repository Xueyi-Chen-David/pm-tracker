import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  showLabel = true,
  className,
  color,
}: {
  value: number;
  showLabel?: boolean;
  className?: string;
  color?: string;
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const fill =
    color ??
    (v >= 100 ? "var(--color-emerald-500, #10b981)" : "var(--color-blue-500, #3b82f6)");
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${v}%`, backgroundColor: fill }}
        />
      </div>
      {showLabel && (
        <span className="text-muted-foreground w-9 text-right text-xs font-medium tabular-nums">
          {v}%
        </span>
      )}
    </div>
  );
}
