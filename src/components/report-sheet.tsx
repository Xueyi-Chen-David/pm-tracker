/**
 * 週報內容容器。列印時用滿版寬度自然分頁（內容太長就第二頁），不再縮放成一頁。
 * `id` 供「輸出 JPG」擷取整份內容。
 */
export function ReportSheet({ children }: { children: React.ReactNode }) {
  return (
    <div
      id="report-capture"
      className="report-doc bg-white break-words [overflow-wrap:anywhere]"
      style={
        {
          WebkitPrintColorAdjust: "exact",
          printColorAdjust: "exact",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
