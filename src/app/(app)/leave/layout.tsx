/**
 * 請假簽核頁刻意沒有標準的 requireModuleAccess("leave") 守門。
 *
 * 這個模組的可見性有一半是 DB 決定的：被排進簽核流程的一般成員並沒有 leave.manage，
 * 靜態模組表（canSeeModule）算不出他們該不該進來，用 requireModuleAccess 反而會把
 * 這些人擋在門外。守門改由 page.tsx 自己做（它本來就要撈 pending / isEligibleApprover，
 * 不必為了守門多打 DB），判斷條件與側欄（app/(app)/layout.tsx 的 showLeaveAsApprover）一致。
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
