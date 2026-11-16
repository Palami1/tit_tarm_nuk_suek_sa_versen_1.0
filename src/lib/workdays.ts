/**
 * ໂມດູນຄິດໄລ່ມື້ເຮັດວຽກຕົວຈິງ ສຳລັບ LTC Intern Tracking System v2
 * 
 * ກົດ:
 * - ມື້ເຮັດວຽກ = ຈັນ–ສຸກ (Mon–Fri)
 * - ບໍ່ຢູ່ໃນວັນພັກ (holidays)
 * - ມື້ລາພັກທີ່ອະນຸມັດແລ້ວ (approved leaves) ຕັດອອກຈາກຕົວຫານ (ບໍ່ນັບເປັນມື້ເຮັດວຽກທີ່ຕ້ອງມາ)
 */

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

/**
 * ກວດວ່າເປັນວັນເສົາ ຫຼື ວັນອາທິດ ບໍ່
 */
export function isWeekend(dateStr: string): boolean {
  // Parse YYYY-MM-DD cleanly
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * ກວດວ່າເປັນວັນພັກລັດຖະການ ຫຼື ວັນພັກບໍລິສັດບໍ່
 */
export function isHoliday(dateStr: string, holidays: Set<string> | string[]): boolean {
  if (holidays instanceof Set) {
    return holidays.has(dateStr);
  }
  return holidays.includes(dateStr);
}

/**
 * ກວດວ່າຕົກຢູ່ໃນຊ່ວງລາພັກທີ່ອະນຸມັດແລ້ວບໍ່
 */
export function isApprovedLeave(dateStr: string, approvedLeaves: DateRange[]): boolean {
  return approvedLeaves.some(range => dateStr >= range.startDate && dateStr <= range.endDate);
}

/**
 * ກວດວ່າເປັນມື້ເຮັດວຽກຕົວຈິງບໍ່ (ຈັນ–ສຸກ, ບໍ່ແມ່ນວັນພັກ, ແລະ ບໍ່ແມ່ນມື້ລາພັກທີ່ອະນຸມັດ)
 */
export function isWorkDay(
  dateStr: string,
  holidays: Set<string> | string[] = [],
  approvedLeaves: DateRange[] = []
): boolean {
  if (isWeekend(dateStr)) return false;
  if (isHoliday(dateStr, holidays)) return false;
  if (isApprovedLeave(dateStr, approvedLeaves)) return false;
  return true;
}

/**
 * ດຶງລາຍຊື່ວັນທີທັງໝົດທີ່ເປັນມື້ເຮັດວຽກລະຫວ່າງ startDate ຫາ endDate
 */
export function getWorkDaysList(
  startDateStr: string,
  endDateStr: string,
  holidays: Set<string> | string[] = [],
  approvedLeaves: DateRange[] = []
): string[] {
  if (!startDateStr || !endDateStr || startDateStr > endDateStr) return [];

  const holidaysSet = holidays instanceof Set ? holidays : new Set(holidays);
  const workDays: string[] = [];

  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const [ey, em, ed] = endDateStr.split('-').map(Number);

  let current = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));

  while (current <= end) {
    const y = current.getUTCFullYear();
    const m = String(current.getUTCMonth() + 1).padStart(2, '0');
    const d = String(current.getUTCDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    if (isWorkDay(dateStr, holidaysSet, approvedLeaves)) {
      workDays.push(dateStr);
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return workDays;
}

/**
 * ຄິດໄລ່ totalWorkDays: ຈຳນວນມື້ເຮັດວຽກທັງໝົດຕະຫຼອດໄລຍະຝຶກງານ (startDate ຫາ endDate)
 */
export function calculateTotalWorkDays(
  startDateStr: string,
  endDateStr: string,
  holidays: Set<string> | string[] = [],
  approvedLeaves: DateRange[] = []
): number {
  return getWorkDaysList(startDateStr, endDateStr, holidays, approvedLeaves).length;
}

/**
 * ຄິດໄລ່ daysPassed: ຈຳນວນມື້ເຮັດວຽກທີ່ຜ່ານມາແລ້ວ (startDate ຫາ min(today, endDate))
 */
export function calculateDaysPassed(
  startDateStr: string,
  endDateStr: string,
  todayStr: string,
  holidays: Set<string> | string[] = [],
  approvedLeaves: DateRange[] = []
): number {
  if (!startDateStr || !todayStr || todayStr < startDateStr) return 0;
  const effectiveEnd = todayStr < endDateStr ? todayStr : endDateStr;
  return getWorkDaysList(startDateStr, effectiveEnd, holidays, approvedLeaves).length;
}


/**
 * ກວດສອບການທັບຊ້ອນກັນລະຫວ່າງ 2 ຊ່ວງວັນທີລາພັກ (Overlap Check)
 */
export function isLeaveOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  return start1 <= end2 && end1 >= start2;
}

/**
 * ກວດສອບກົດຍ້ອນຫຼັງ (Backdate Limit):
 * ວັນທີເລີ່ມລາພັກ ຕ້ອງຍ້ອນຫຼັງບໍ່ເກີນ maxDays (ຄ່າເລີ່ມຕົ້ນ 7 ວັນ) ທຽບກັບ today
 */
export function isBackdateWithinLimit(
  startDateStr: string,
  todayStr: string,
  maxDays = 7
): boolean {
  const startDate = new Date(startDateStr);
  const today = new Date(todayStr);
  const diffTime = today.getTime() - startDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= maxDays;
}

/**
 * ກວດສອບວ່າຊ່ວງລາພັກ ຢູ່ໃນຊ່ວງຝຶກງານບໍ່ (Within Internship Period)
 */
export function isLeaveWithinInternship(
  leaveStart: string,
  leaveEnd: string,
  internStart: string,
  internEnd: string
): boolean {
  if (leaveStart > leaveEnd) return false;
  if (internStart && leaveStart < internStart) return false;
  if (internEnd && leaveEnd > internEnd) return false;
  return true;
}

/**
 * ຄິດໄລ່ຈຳນວນມື້ລາພັກຕົວຈິງ (countLeaveDays):
 * - ຕັດເສົາ–ອາທິດ ແລະ ວັນພັກ
 * - ຖ້າ startDate == endDate ແລະ periods ແມ່ນ 'morning' ຫຼື 'afternoon' = 0.5 ມື້
 * - ຖ້າ startDate == endDate ແລະ periods ແມ່ນ 'both' = 1 ມື້
 * - ຖ້າ startDate < endDate: ບັງຄັບທັງສອງຮອບ (ເຕັມມື້) = ຈຳນວນມື້ເຮັດວຽກໃນຊ່ວງ
 */
export function countLeaveDays(
  startDateStr: string,
  endDateStr: string,
  periods: 'morning' | 'afternoon' | 'both' = 'both',
  holidays: Set<string> | string[] = []
): number {
  if (!startDateStr || !endDateStr || startDateStr > endDateStr) return 0;
  const holidaysSet = holidays instanceof Set ? holidays : new Set(holidays);

  // Single-day leave
  if (startDateStr === endDateStr) {
    if (isWeekend(startDateStr) || isHoliday(startDateStr, holidaysSet)) {
      return 0;
    }
    return periods === 'both' ? 1 : 0.5;
  }

  // Multi-day leave: always counts full working days
  const workDays = getWorkDaysList(startDateStr, endDateStr, holidaysSet, []);
  return workDays.length;
}

/**
 * ກວດສອບ Overlap ຂອງ Leave ພ້ອມ Period:
 * ຖ້າເປັນມື້ດຽວກັນ, overlap ຈະເກີດຂຶ້ນເມື່ອ:
 * - ຝ່າຍໃດໜຶ່ງ (ຫຼື ທັງສອງ) ເປັນ 'both'
 * - ຫຼື ທັງສອງຝ່າຍເປັນ period ດຽວກັນ (ເຊັ່ນ morning ກັບ morning)
 */
export function isDetailedLeaveOverlap(
  req1: { startDate: string; endDate: string; periods?: string },
  req2: { startDate: string; endDate: string; periods?: string }
): boolean {
  if (req1.startDate > req2.endDate || req1.endDate < req2.startDate) {
    return false; // ບໍ່ມີວັນທີທັບຊ້ອນກັນເລີຍ
  }

  // ຖ້າມີການທັບຊ້ອນກັນຫຼາຍມື້ (ຫຼາຍກວ່າ 1 ມື້) -> overlap ແນ່ນອນ ເພາະຫຼາຍມື້ບັງຄັບ both
  if (req1.startDate !== req1.endDate || req2.startDate !== req2.endDate) {
    return true;
  }

  // ທັງສອງເປັນມື້ດຽວກັນ (startDate == endDate)
  const p1 = req1.periods || 'both';
  const p2 = req2.periods || 'both';

  if (p1 === 'both' || p2 === 'both') {
    return true;
  }

  return p1 === p2;
}

/**
 * ສ້າງ Map ຂອງ leaveFraction ສຳລັບແຕ່ລະວັນທີ (0.5 ຫຼື 1)
 */
export function getDailyLeaveFractions(
  approvedLeaves: { startDate: string; endDate: string; periods?: string }[],
  holidays: Set<string> | string[] = []
): Map<string, number> {
  const holidaysSet = holidays instanceof Set ? holidays : new Set(holidays);
  const fractions = new Map<string, number>();

  for (const leave of approvedLeaves) {
    const p = leave.periods || 'both';
    if (leave.startDate === leave.endDate) {
      const dt = leave.startDate;
      if (!isWeekend(dt) && !isHoliday(dt, holidaysSet)) {
        const cur = fractions.get(dt) || 0;
        const add = p === 'both' ? 1 : 0.5;
        fractions.set(dt, Math.min(1, cur + add));
      }
    } else {
      const days = getWorkDaysList(leave.startDate, leave.endDate, holidaysSet, []);
      for (const dt of days) {
        fractions.set(dt, 1);
      }
    }
  }

  return fractions;
}
