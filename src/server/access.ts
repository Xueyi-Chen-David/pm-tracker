/**
 * 編輯權限：這是單一 workspace 的內部團隊工具——只要是登入的工作區成員，
 * 都能編輯任何專案（呼叫端皆已先經過 requireUser()）。角色（負責人/成員/檢視者）
 * 與職位文字僅作為顯示與週報用途，不限制編輯。
 *
 * 參數保留以利日後若要恢復更細的權限控管（屆時在此查 DB 判斷）。
 */
export async function canEditProject(
  userId: string,
  projectId: string,
  isBoss?: boolean,
): Promise<boolean> {
  void userId;
  void projectId;
  void isBoss;
  return true;
}

export async function assertCanEditProject(
  userId: string,
  projectId: string,
  isBoss?: boolean,
): Promise<void> {
  // 目前所有登入成員皆可編輯；保留簽章以利日後加回權限檢查。
  void userId;
  void projectId;
  void isBoss;
}
