/**
 * 勞健保 / 勞退 / 職災 / 二代健保 的純計算（方便測試 / 稽核），前後端共用。
 *
 * 設計重點：費率與投保級距是「資料」不是「程式碼」——DEFAULT_* 只是「一鍵帶當年預設」用，
 * 實際計算一律吃組織後台存的 PayrollSetting 與 InsuranceBracket，HR 可自行維護（每年新制自己改）。
 *
 * 投保金額對應：45,800 以下勞保 / 健保 / 勞退共用同一組級距，故只存單一 grid，
 * 各保險再各自套上限（勞保 45,800 / 健保 313,000 / 勞退 150,000）。
 */

/** 費率 / 上限設定（對應 PayrollSetting 的計算子集）。 */
export type PayrollRates = {
  laborRate: number; // 勞保費率（普通事故＋就業）
  laborEmployeeShare: number;
  laborEmployerShare: number;
  healthRate: number;
  healthEmployeeShare: number;
  healthEmployerShare: number;
  healthAvgDependents: number;
  pensionEmployerRate: number;
  occupationalRate: number;
  supplementaryRate: number;
  laborCeiling: number;
  healthCeiling: number;
  pensionCeiling: number;
};

/**
 * 2026（民國115年）法定預設。⚠️ 僅供「一鍵帶入」起始值，請 HR 對照勞保局 / 健保署最新公告核對；
 * 之後每年新制在後台自行更新即可，不需改程式。
 */
export const DEFAULT_PAYROLL_SETTING_2026 = {
  laborRate: 0.125, // 普通事故 11.5% ＋ 就業保險 1%
  laborEmployeeShare: 0.2,
  laborEmployerShare: 0.7,
  healthRate: 0.0517,
  healthEmployeeShare: 0.3,
  healthEmployerShare: 0.6,
  healthAvgDependents: 0.57,
  pensionEmployerRate: 0.06,
  occupationalRate: 0.002, // 職災（雇主全負擔，依行業別，約 0.2%）
  supplementaryRate: 0.0211, // 二代健保補充保費
  laborCeiling: 45800,
  healthCeiling: 313000,
  pensionCeiling: 150000,
  minWageMonthly: 29500,
  minWageHourly: 196,
} as const;

/**
 * 2026（民國115年）投保金額分級 grid（月投保金額，由低到高）。
 * 低段（29,500–45,800）＝勞保 11 級；其上延伸至健保上限 313,000。⚠️ 起始預設，請核對後自行維護。
 */
export const DEFAULT_INSURANCE_GRID_2026: number[] = [
  // 勞保 11 級（與健保低段相同）
  29500, 30300, 31800, 33300, 34800, 36300, 38200, 40100, 42000, 43900, 45800,
  // 健保續接級距
  48200, 50600, 53000, 55400, 57800, 60800, 63800, 66800, 69800, 72800, 76500,
  80200, 83900, 87600, 92100, 96600, 101100, 105600, 110100, 115500, 120900,
  126300, 131700, 137100, 142500, 147900, 150000, 156400, 162800, 169200,
  175600, 182000, 189500, 197000, 204500, 212000, 219500, 227000, 234500,
  242000, 249500, 257000, 264500, 272000, 279500, 287000, 294500, 302000,
  309500, 313000,
];

/** 四捨五入到整數（勞健保金額以元為單位，不留小數）。 */
function roundNT(n: number): number {
  return Math.round(n);
}

/**
 * 由工資對應投保金額：取「≥ 工資」的最小級距，再套上該保險的上限。
 * 工資低於最低級距時取最低級距；grid 需由低到高排序。
 */
export function pickInsured(
  gridAsc: number[],
  wage: number,
  ceiling: number,
): number {
  if (gridAsc.length === 0) return Math.min(Math.max(0, wage), ceiling);
  let grade = gridAsc[gridAsc.length - 1];
  for (const g of gridAsc) {
    if (g >= wage) {
      grade = g;
      break;
    }
  }
  return Math.min(grade, ceiling);
}

export type StatutoryInput = {
  /** 工資（用來對應投保級距；通常＝本薪＋計入投保的固定加給）。 */
  wage: number;
  /** 手動指定投保金額（如高薪低報 / 特殊申報）；有值時優先於 wage 對應。 */
  insuredOverride?: number | null;
  dependents: number; // 健保眷口（0–3）
  pensionSelfRate: number; // 勞退自願提繳率 0–0.06
  laborInsured: boolean;
  healthInsured: boolean;
  pensionEnrolled: boolean;
};

export type StatutoryResult = {
  /** 對應到的投保金額（供快照顯示；取勞保用的 insured，health/pension 另算）。 */
  insuredLabor: number;
  insuredHealth: number;
  insuredPension: number;
  // 員工自付
  laborEmployee: number;
  healthEmployee: number;
  pensionSelf: number;
  employeeTotal: number;
  // 公司負擔
  laborEmployer: number;
  healthEmployer: number;
  pensionEmployer: number;
  occupationalEmployer: number;
  employerTotal: number; // 不含二代健保雇主補充保費（由當月給付差額另算）
};

/**
 * 計算一位成員的勞健保 / 勞退 / 職災（月）。
 * 健保眷口計費上限 3 口（員工端）；雇主端用平均眷口。職災以勞保投保薪資為基礎。
 */
export function computeStatutory(
  rates: PayrollRates,
  gridAsc: number[],
  input: StatutoryInput,
): StatutoryResult {
  const wageForBracket =
    input.insuredOverride && input.insuredOverride > 0
      ? input.insuredOverride
      : input.wage;

  const insuredLabor = pickInsured(gridAsc, wageForBracket, rates.laborCeiling);
  const insuredHealth = pickInsured(gridAsc, wageForBracket, rates.healthCeiling);
  const insuredPension = pickInsured(
    gridAsc,
    wageForBracket,
    rates.pensionCeiling,
  );

  const deps = Math.min(3, Math.max(0, Math.floor(input.dependents)));
  const selfRate = Math.min(0.06, Math.max(0, input.pensionSelfRate));

  const laborEmployee = input.laborInsured
    ? roundNT(insuredLabor * rates.laborRate * rates.laborEmployeeShare)
    : 0;
  const laborEmployer = input.laborInsured
    ? roundNT(insuredLabor * rates.laborRate * rates.laborEmployerShare)
    : 0;

  // 員工健保 = 投保金額 × 費率 × 自付比例 × (本人 1 ＋ 眷口數)
  const healthEmployee = input.healthInsured
    ? roundNT(
        insuredHealth * rates.healthRate * rates.healthEmployeeShare * (1 + deps),
      )
    : 0;
  // 雇主健保 = 投保金額 × 費率 × 雇主比例 × (1 ＋ 平均眷口)
  const healthEmployer = input.healthInsured
    ? roundNT(
        insuredHealth *
          rates.healthRate *
          rates.healthEmployerShare *
          (1 + rates.healthAvgDependents),
      )
    : 0;

  const pensionEmployer = input.pensionEnrolled
    ? roundNT(insuredPension * rates.pensionEmployerRate)
    : 0;
  const pensionSelf = input.pensionEnrolled
    ? roundNT(insuredPension * selfRate)
    : 0;

  // 職災保險（雇主全負擔）以勞保投保薪資為基礎。
  const occupationalEmployer = input.laborInsured
    ? roundNT(insuredLabor * rates.occupationalRate)
    : 0;

  return {
    insuredLabor,
    insuredHealth,
    insuredPension,
    laborEmployee,
    healthEmployee,
    pensionSelf,
    employeeTotal: laborEmployee + healthEmployee + pensionSelf,
    laborEmployer,
    healthEmployer,
    pensionEmployer,
    occupationalEmployer,
    employerTotal:
      laborEmployer + healthEmployer + pensionEmployer + occupationalEmployer,
  };
}

/**
 * 二代健保「雇主」補充保費：當月給付薪資總額超過投保金額的差額 × 費率。
 * 以單一員工估算：max(0, 當月工資 − 健保投保金額) × supplementaryRate。
 */
export function employerSupplementaryPremium(
  rates: PayrollRates,
  monthlyWagePaid: number,
  insuredHealth: number,
): number {
  return roundNT(
    Math.max(0, monthlyWagePaid - insuredHealth) * rates.supplementaryRate,
  );
}
