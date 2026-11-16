/**
 * ໂມດູນຄິດໄລ່ເກຣດປະເມີນຜົນ ສຳລັບ LTC Intern Tracking System v2
 * 
 * ກົດ:
 * - ມື້ທີ່ນັບວ່າ "ມາ" = ມີ check-in (ລວມທັງມື້ forgot-checkout)
 * - Performance % = attendedDays ÷ daysPassed × 100 (ຖ້າ daysPassed = 0 -> null)
 * - ເກນເລີ່ມຕົ້ນ: A ≥ 80, B ≥ 70, C ≥ 60, D ≥ 50, F < 50
 * - ເກຣດຄິດຈາກການມາວຽກເທົ່ານັ້ນ
 */

export interface GradeThresholds {
  A: number;
  B: number;
  C: number;
  D: number;
}

export const DEFAULT_GRADE_THRESHOLDS: GradeThresholds = {
  A: 80,
  B: 70,
  C: 60,
  D: 50,
};

/**
 * ຄິດໄລ່ເປີເຊັນການມາວຽກຕົວຈິງ ຕາມ Day Weights (LTC v2 & Phase 3.1):
 * dayWeight = 1 - leaveFraction
 * ຕົວຫານ = ຜົນລວມ dayWeight ຂອງມື້ເຮັດວຽກທີ່ຜ່ານມາ
 * ຕົວຕັ້ງ = ຜົນລວມ dayWeight ຂອງມື້ທີ່ມີ check-in
 * ມື້ລາເຕັມມື້ (weight 0) ບໍ່ນັບທັງສອງຝັ່ງ ເຖິງຈະ check-in ກໍຕາມ
 * ຕ້ອງບໍ່ເກີນ 100%
 */
export function calculateWeightedAttendancePerformance(
  passedWorkdays: string[],
  attendedDates: Set<string> | string[],
  dailyLeaveFractions: Map<string, number> = new Map()
): {
  performancePercent: number | null;
  numerator: number;
  denominator: number;
} {
  const attendedSet = attendedDates instanceof Set ? attendedDates : new Set(attendedDates);

  let denominator = 0;
  let numerator = 0;

  for (const dateStr of passedWorkdays) {
    const fraction = dailyLeaveFractions.get(dateStr) || 0;
    const dayWeight = Math.max(0, 1 - fraction); // 0, 0.5, or 1

    denominator += dayWeight;

    // ຖ້າ dayWeight > 0 (ບໍ່ແມ່ນລາເຕັມມື້) ແລະ ມີການ check-in
    if (dayWeight > 0 && attendedSet.has(dateStr)) {
      numerator += dayWeight;
    }
  }

  if (denominator <= 0) {
    return { performancePercent: null, numerator: 0, denominator: 0 };
  }

  const rawPercent = (numerator / denominator) * 100;
  const clampedPercent = Math.min(100, Math.max(0, Math.round(rawPercent)));

  return {
    performancePercent: clampedPercent,
    numerator: parseFloat(numerator.toFixed(1)),
    denominator: parseFloat(denominator.toFixed(1)),
  };
}

/**
 * ຄິດໄລ່ເປີເຊັນການມາເຮັດວຽກຕົວຈິງ
 */
export function calculateAttendancePerformance(
  attendedDaysCount: number,
  daysPassedCount: number
): number | null {
  if (typeof daysPassedCount !== 'number' || daysPassedCount <= 0) {
    return null;
  }
  const percent = (attendedDaysCount / daysPassedCount) * 100;
  return Math.min(100, Math.max(0, Math.round(percent)));
}

/**
 * ຕັດເກຣດ A, B, C, D, F ອີງຕາມ Performance %
 */
export function determineGrade(
  performancePercent: number | null,
  thresholds: GradeThresholds = DEFAULT_GRADE_THRESHOLDS
): string {
  if (performancePercent === null) return '—';

  if (performancePercent >= thresholds.A) return 'A';
  if (performancePercent >= thresholds.B) return 'B';
  if (performancePercent >= thresholds.C) return 'C';
  if (performancePercent >= thresholds.D) return 'D';
  return 'F';
}

/**
 * ຄືນຄ່າສະຖານະຂອງເກຣດ: "ຊົ່ວຄາວ" (Provisional) ຫຼື "ສຸດທ້າຍ" (Final)
 */
export function getGradeStatus(
  todayStr: string,
  endDateStr: string
): 'provisional' | 'final' {
  if (!todayStr || !endDateStr) return 'provisional';
  return todayStr >= endDateStr ? 'final' : 'provisional';
}

/**
 * ລາຍລະອຽດເກຣດພ້ອມຄຳອະທິບາຍພາສາລາວ
 */
export function getGradeDetails(
  performancePercent: number | null,
  isFinal: boolean,
  thresholds: GradeThresholds = DEFAULT_GRADE_THRESHOLDS
): {
  grade: string;
  label: string;
  colorClass: string;
} {
  const grade = determineGrade(performancePercent, thresholds);
  const statusSuffix = isFinal ? '(ສຸດທ້າຍ)' : '(ຊົ່ວຄາວ)';

  switch (grade) {
    case 'A':
      return { grade, label: `A - ດີເລີດ ${statusSuffix}`, colorClass: 'text-emerald-500 bg-emerald-500/10' };
    case 'B':
      return { grade, label: `B - ດີ ${statusSuffix}`, colorClass: 'text-blue-500 bg-blue-500/10' };
    case 'C':
      return { grade, label: `C - ປານກາງ ${statusSuffix}`, colorClass: 'text-amber-500 bg-amber-500/10' };
    case 'D':
      return { grade, label: `D - ອ່ອນ ${statusSuffix}`, colorClass: 'text-orange-500 bg-orange-500/10' };
    case 'F':
      return { grade, label: `F - ຕົກ ${statusSuffix}`, colorClass: 'text-red-500 bg-red-500/10' };
    default:
      return { grade: '—', label: 'ກຳລັງປະເມີນ...', colorClass: 'text-gray-400 bg-gray-500/10' };
  }
}
