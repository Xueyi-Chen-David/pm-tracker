"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Save } from "lucide-react";
import {
  seedPayrollDefaults,
  updatePayrollSetting,
  setInsuranceBrackets,
} from "@/server/actions/payroll-settings";
import type { PayrollSettingRow } from "@/server/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";

/** 費率欄位（以百分比顯示，儲存時 ÷100）；金額欄位以整數（元）顯示。 */
type PctField = { key: PctKey; label: string; hint?: string };
type PctKey =
  | "laborRate"
  | "laborEmployeeShare"
  | "laborEmployerShare"
  | "healthRate"
  | "healthEmployeeShare"
  | "healthEmployerShare"
  | "pensionEmployerRate"
  | "occupationalRate"
  | "supplementaryRate";
type MoneyKey =
  | "laborCeiling"
  | "healthCeiling"
  | "pensionCeiling"
  | "minWageMonthly"
  | "minWageHourly";

const PCT_GROUPS: { title: string; fields: PctField[] }[] = [
  {
    title: "勞保（普通事故＋就業保險）",
    fields: [
      { key: "laborRate", label: "費率", hint: "含就業保險，如 12.5" },
      { key: "laborEmployeeShare", label: "勞工自付", hint: "如 20" },
      { key: "laborEmployerShare", label: "雇主負擔", hint: "如 70" },
    ],
  },
  {
    title: "健保",
    fields: [
      { key: "healthRate", label: "費率", hint: "如 5.17" },
      { key: "healthEmployeeShare", label: "勞工自付", hint: "如 30" },
      { key: "healthEmployerShare", label: "雇主負擔", hint: "如 60" },
    ],
  },
  {
    title: "勞退 / 職災 / 二代健保",
    fields: [
      { key: "pensionEmployerRate", label: "勞退雇主提繳", hint: "如 6" },
      { key: "occupationalRate", label: "職災費率", hint: "依行業別，如 0.2" },
      { key: "supplementaryRate", label: "二代健保補充", hint: "如 2.11" },
    ],
  },
];

const MONEY_FIELDS: { key: MoneyKey; label: string }[] = [
  { key: "laborCeiling", label: "勞保投保上限" },
  { key: "healthCeiling", label: "健保投保上限" },
  { key: "pensionCeiling", label: "勞退提繳上限" },
  { key: "minWageMonthly", label: "基本工資（月）" },
  { key: "minWageHourly", label: "基本工資（時）" },
];

export function PayrollSettingsPanel({
  setting,
  brackets,
  canManage,
}: {
  setting: PayrollSettingRow;
  brackets: number[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // 百分比欄位（顯示用 ×100）；金額欄位（元）。未設定時給空字串。
  const [pct, setPct] = useState<Record<PctKey, string>>(() => ({
    laborRate: fmtPct(setting?.laborRate),
    laborEmployeeShare: fmtPct(setting?.laborEmployeeShare),
    laborEmployerShare: fmtPct(setting?.laborEmployerShare),
    healthRate: fmtPct(setting?.healthRate),
    healthEmployeeShare: fmtPct(setting?.healthEmployeeShare),
    healthEmployerShare: fmtPct(setting?.healthEmployerShare),
    pensionEmployerRate: fmtPct(setting?.pensionEmployerRate),
    occupationalRate: fmtPct(setting?.occupationalRate),
    supplementaryRate: fmtPct(setting?.supplementaryRate),
  }));
  const [avgDeps, setAvgDeps] = useState(
    setting ? String(setting.healthAvgDependents) : "0.57",
  );
  const [money, setMoney] = useState<Record<MoneyKey, string>>(() => ({
    laborCeiling: String(setting?.laborCeiling ?? 45800),
    healthCeiling: String(setting?.healthCeiling ?? 313000),
    pensionCeiling: String(setting?.pensionCeiling ?? 150000),
    minWageMonthly: String(setting?.minWageMonthly ?? 29500),
    minWageHourly: String(setting?.minWageHourly ?? 196),
  }));
  const [bracketText, setBracketText] = useState(brackets.join("、"));

  function seed() {
    if (
      !confirm(
        "帶入 2026（民國115年）法定預設費率與投保金額分級表？這會覆蓋目前的費率與級距設定。",
      )
    )
      return;
    start(async () => {
      try {
        await seedPayrollDefaults();
        toast.success("已帶入 2026 法定預設，請核對後即可使用");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "帶入失敗");
      }
    });
  }

  function saveRates() {
    start(async () => {
      try {
        await updatePayrollSetting({
          laborRate: pctVal(pct.laborRate),
          laborEmployeeShare: pctVal(pct.laborEmployeeShare),
          laborEmployerShare: pctVal(pct.laborEmployerShare),
          healthRate: pctVal(pct.healthRate),
          healthEmployeeShare: pctVal(pct.healthEmployeeShare),
          healthEmployerShare: pctVal(pct.healthEmployerShare),
          healthAvgDependents: Number(avgDeps) || 0,
          pensionEmployerRate: pctVal(pct.pensionEmployerRate),
          occupationalRate: pctVal(pct.occupationalRate),
          supplementaryRate: pctVal(pct.supplementaryRate),
          laborCeiling: Number(money.laborCeiling) || 0,
          healthCeiling: Number(money.healthCeiling) || 0,
          pensionCeiling: Number(money.pensionCeiling) || 0,
          minWageMonthly: Number(money.minWageMonthly) || 0,
          minWageHourly: Number(money.minWageHourly) || 0,
        });
        toast.success("已儲存費率設定");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "儲存失敗");
      }
    });
  }

  function saveBrackets() {
    const amounts = bracketText
      .split(/[\s,、，\n]+/)
      .map((s) => Number(s.replace(/[^\d]/g, "")))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (amounts.length === 0) {
      toast.error("請至少輸入一個投保金額");
      return;
    }
    start(async () => {
      try {
        await setInsuranceBrackets({ amounts });
        toast.success(`已儲存 ${new Set(amounts).size} 個投保級距`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "儲存失敗");
      }
    });
  }

  if (!setting) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-muted-foreground max-w-md text-sm">
          尚未設定勞健保費率與投保級距。點下方一鍵帶入 2026（民國115年）法定預設，
          之後可自行調整；產生薪資單時就會自動計算勞保 / 健保 / 勞退的自付與公司負擔。
        </p>
        {canManage && (
          <Button onClick={seed} disabled={pending} className="gap-1.5">
            <Sparkles className="h-4 w-4" /> 帶入 2026 法定預設
          </Button>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          費率與投保級距是「資料」——
          {setting.seededYear
            ? `目前為 ${setting.seededYear} 法定預設（可自行調整）。`
            : "已自訂。"}
          每年新制在這裡更新即可。⚠️ 請對照勞保局 / 健保署最新公告核對。
        </p>
        {canManage && (
          <Button
            variant="outline"
            onClick={seed}
            disabled={pending}
            className="gap-1.5"
          >
            <Sparkles className="h-4 w-4" /> 重新帶入 2026 預設
          </Button>
        )}
      </div>

      {/* 費率 */}
      <Card className="space-y-4 p-4">
        <div className="text-sm font-semibold">費率與上限（%）</div>
        {PCT_GROUPS.map((g) => (
          <div key={g.title} className="space-y-1.5">
            <div className="text-muted-foreground text-xs">{g.title}</div>
            <div className="grid gap-2 sm:grid-cols-3">
              {g.fields.map((f) => (
                <div key={f.key} className="grid gap-1">
                  <Label className="text-xs">{f.label}（%）</Label>
                  <Input
                    type="number"
                    step="0.01"
                    disabled={!canManage}
                    value={pct[f.key]}
                    onChange={(e) =>
                      setPct((p) => ({ ...p, [f.key]: e.target.value }))
                    }
                    placeholder={f.hint}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="grid gap-1">
            <Label className="text-xs">健保平均眷口（雇主負擔用）</Label>
            <Input
              type="number"
              step="0.01"
              disabled={!canManage}
              value={avgDeps}
              onChange={(e) => setAvgDeps(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-xs">投保上限 / 基本工資（元）</div>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {MONEY_FIELDS.map((f) => (
              <div key={f.key} className="grid gap-1">
                <Label className="text-xs">{f.label}</Label>
                <Input
                  type="number"
                  disabled={!canManage}
                  value={money[f.key]}
                  onChange={(e) =>
                    setMoney((m) => ({ ...m, [f.key]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
        </div>
        {canManage && (
          <div className="flex justify-end">
            <Button onClick={saveRates} disabled={pending} className="gap-1.5">
              <Save className="h-4 w-4" /> 儲存費率
            </Button>
          </div>
        )}
      </Card>

      {/* 投保金額分級表 */}
      <Card className="space-y-2 p-4">
        <div className="text-sm font-semibold">
          投保金額分級表（{brackets.length} 級）
        </div>
        <p className="text-muted-foreground text-xs">
          由低到高的投保金額，以頓號 / 逗號 / 空白分隔。計算時取「≥ 工資」的最小級距，
          再各自套上限（勞保 {money.laborCeiling}／健保 {money.healthCeiling}／勞退{" "}
          {money.pensionCeiling}）。45,800 以下三者共用同一組級距。
        </p>
        <Textarea
          rows={5}
          disabled={!canManage}
          value={bracketText}
          onChange={(e) => setBracketText(e.target.value)}
          className="font-mono text-xs"
        />
        {canManage && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={saveBrackets}
              disabled={pending}
              className="gap-1.5"
            >
              <Save className="h-4 w-4" /> 儲存級距
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

/** 小數費率 → 百分比字串（0.125 → "12.5"）。 */
function fmtPct(v: number | undefined | null): string {
  if (v == null) return "";
  return String(Math.round(v * 10000) / 100);
}
/** 百分比字串 → 小數費率（"12.5" → 0.125）。 */
function pctVal(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n / 100 : 0;
}
