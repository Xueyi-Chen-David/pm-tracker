/**
 * 請假 / 出差申請的表格外殼：狀態 / 申請人 / 期間‧天數 / 類型 / 事由 / 簽核流程 / 操作。
 * 請假申請與出差 / 事件登記共用同一張表（見 LeaveRequestTableRow / MemberEventTableRow），
 * 逐列交錯排在同一條時間軸下也不會忽寬忽窄。
 */
export function ApprovalTable({
  showRequester,
  requesterLabel = "申請人",
  children,
}: {
  /** 個人自己的時間軸不需要這欄（一律是自己）；全體總覽才顯示。 */
  showRequester: boolean;
  requesterLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted text-muted-foreground sticky top-0 z-10 text-xs">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium">狀態</th>
            {showRequester && (
              <th className="px-4 py-2.5 text-left font-medium">{requesterLabel}</th>
            )}
            <th className="px-4 py-2.5 text-left font-medium">期間 / 天數</th>
            <th className="px-4 py-2.5 text-left font-medium">類型</th>
            <th className="px-4 py-2.5 text-left font-medium">事由</th>
            <th className="px-4 py-2.5 text-left font-medium">簽核流程</th>
            <th className="px-4 py-2.5 text-left font-medium">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}
