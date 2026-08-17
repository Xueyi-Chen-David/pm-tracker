import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * 原生 select / date / time input 的共用樣式——LeaveRequestForm（申請請假）與
 * QuickEventForm（登記出差 / 事件）本來各自宣告一份一模一樣的字串，抽出來避免
 * 兩個外觀相近的表單哪天改版只改到一邊、悄悄走鐘。
 */
export const inputCls =
  "border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-md border px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

/** Label + 原生 date / time input，兩個表單共用同一顆，日期欄位樣式與行為保證一致。 */
export function DateField({
  id,
  label,
  type = "date",
  value,
  onChange,
  min,
  className,
}: {
  id: string;
  label: string;
  type?: "date" | "time";
  value: string;
  onChange: (v: string) => void;
  min?: string;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        type={type}
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </div>
  );
}
