import { primaryName, hasNickname, type NameSource } from "@/lib/display";
import { cn } from "@/lib/utils";

/**
 * 顯示成員名稱：主名稱（真實姓名）＋（若勾選）旁邊小一號的綽號 / 英文名。
 */
export function MemberName({
  u,
  className,
  nickClassName,
}: {
  u: NameSource | null | undefined;
  className?: string;
  nickClassName?: string;
}) {
  if (!u) return <span className={className}>—</span>;
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5", className)}>
      <span className="break-words">{primaryName(u)}</span>
      {hasNickname(u) && (
        <span
          className={cn(
            "text-muted-foreground shrink-0 text-[0.82em] font-normal",
            nickClassName,
          )}
        >
          {u.nickname!.trim()}
        </span>
      )}
    </span>
  );
}
