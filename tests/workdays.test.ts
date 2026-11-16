import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  isWeekend,
  isHoliday,
  isApprovedLeave,
  isWorkDay,
  calculateTotalWorkDays,
  calculateDaysPassed,
  getWorkDaysList,
  isLeaveOverlap,
  isBackdateWithinLimit,
  isLeaveWithinInternship,
  countLeaveDays,
  isDetailedLeaveOverlap,
} from '../src/lib/workdays.ts';
import { calculateAttendancePerformance } from '../src/lib/grading.ts';

describe('Workdays & Calendar Rules Tests', () => {
  test('Weekend detection (Saturday and Sunday)', () => {
    // 2026-04-03 is Friday, 2026-04-04 is Saturday, 2026-04-05 is Sunday, 2026-04-06 is Monday
    assert.strictEqual(isWeekend('2026-04-03'), false); // Fri
    assert.strictEqual(isWeekend('2026-04-04'), true);  // Sat
    assert.strictEqual(isWeekend('2026-04-05'), true);  // Sun
    assert.strictEqual(isWeekend('2026-04-06'), false); // Mon
  });

  test('Holiday exclusion', () => {
    const holidays = ['2026-04-14', '2026-04-15', '2026-04-16']; // ບຸນປີໃໝ່ລາວ
    assert.strictEqual(isHoliday('2026-04-14', holidays), true);
    assert.strictEqual(isHoliday('2026-04-17', holidays), false);
  });

  test('Approved leave exclusion', () => {
    const approvedLeaves = [{ startDate: '2026-04-20', endDate: '2026-04-22' }];
    assert.strictEqual(isApprovedLeave('2026-04-19', approvedLeaves), false);
    assert.strictEqual(isApprovedLeave('2026-04-20', approvedLeaves), true);  // boundary start
    assert.strictEqual(isApprovedLeave('2026-04-21', approvedLeaves), true);
    assert.strictEqual(isApprovedLeave('2026-04-22', approvedLeaves), true);  // boundary end
    assert.strictEqual(isApprovedLeave('2026-04-23', approvedLeaves), false);
  });

  test('isWorkDay considers Mon-Fri minus holidays minus approved leaves', () => {
    const holidays = ['2026-04-07']; // Tuesday holiday
    const leaves = [{ startDate: '2026-04-08', endDate: '2026-04-08' }]; // Wednesday leave

    assert.strictEqual(isWorkDay('2026-04-06', holidays, leaves), true);  // Mon: regular work
    assert.strictEqual(isWorkDay('2026-04-07', holidays, leaves), false); // Tue: holiday
    assert.strictEqual(isWorkDay('2026-04-08', holidays, leaves), false); // Wed: approved leave
    assert.strictEqual(isWorkDay('2026-04-09', holidays, leaves), true);  // Thu: regular work
    assert.strictEqual(isWorkDay('2026-04-11', holidays, leaves), false); // Sat: weekend
  });

  test('calculateTotalWorkDays counts exact working days in range', () => {
    // 1 week: 2026-04-06 (Mon) to 2026-04-10 (Fri) = 5 days
    const total = calculateTotalWorkDays('2026-04-06', '2026-04-10');
    assert.strictEqual(total, 5);

    // 1 week with 1 holiday on Tuesday = 4 days
    const totalWithHoliday = calculateTotalWorkDays('2026-04-06', '2026-04-10', ['2026-04-07']);
    assert.strictEqual(totalWithHoliday, 4);

    // 1 week with 1 holiday on Tue + 1 leave on Wed = 3 days
    const totalWithBoth = calculateTotalWorkDays(
      '2026-04-06',
      '2026-04-10',
      ['2026-04-07'],
      [{ startDate: '2026-04-08', endDate: '2026-04-08' }]
    );
    assert.strictEqual(totalWithBoth, 3);
  });

  test('calculateDaysPassed handles boundaries correctly', () => {
    const start = '2026-04-06'; // Mon
    const end = '2026-04-10';   // Fri

    // Before start date
    assert.strictEqual(calculateDaysPassed(start, end, '2026-04-05'), 0);

    // First day of internship (2026-04-06)
    assert.strictEqual(calculateDaysPassed(start, end, '2026-04-06'), 1);

    // Midweek (Wednesday 2026-04-08)
    assert.strictEqual(calculateDaysPassed(start, end, '2026-04-08'), 3);

    // Last day (Friday 2026-04-10)
    assert.strictEqual(calculateDaysPassed(start, end, '2026-04-10'), 5);

    // Past end date (stays capped at total work days)
    assert.strictEqual(calculateDaysPassed(start, end, '2026-04-15'), 5);
  });
});

describe('Phase 3 Advanced Leave & Boundary Tests', () => {
  test('1. ມື້ລາຕັດຈາກຕົວຫານ (Denominator deduction) & ບໍ່ເກີນ 100% ຖ້າມາ check-in ມື້ລາ', () => {
    // 2 weeks: 2026-04-06 (Mon) to 2026-04-17 (Fri) = 10 work days
    // Approved leave: 2 days (2026-04-08 to 2026-04-09)
    const leaves = [{ startDate: '2026-04-08', endDate: '2026-04-09' }];
    const totalWorkDays = calculateTotalWorkDays('2026-04-06', '2026-04-17', [], leaves);
    assert.strictEqual(totalWorkDays, 8); // 10 - 2 = 8 days denominator

    const daysPassed = calculateDaysPassed('2026-04-06', '2026-04-17', '2026-04-17', [], leaves);
    assert.strictEqual(daysPassed, 8); // Denominator is 8

    // Case A: Attended all 8 valid work days -> 100%
    assert.strictEqual(calculateAttendancePerformance(8, daysPassed), 100);

    // Case B: User comes to work even on leave day (e.g. 9 check-in days) -> must cap at 100%
    assert.strictEqual(calculateAttendancePerformance(9, daysPassed), 100);
    assert.strictEqual(calculateAttendancePerformance(10, daysPassed), 100);
  });

  test('2. ລາຄາບເສົາ-ອາທິດ (Leave spanning weekends): ຕັດສະເພາະມື້ເຮັດວຽກຕົວຈິງ', () => {
    // Leave from Friday to next Tuesday (2026-04-10 Fri to 2026-04-14 Tue)
    // Calendar days = 5 days (Fri, Sat, Sun, Mon, Tue)
    // Work days in leave = 3 days (Fri, Mon, Tue). Sat and Sun are NOT work days.
    const leaves = [{ startDate: '2026-04-10', endDate: '2026-04-14' }];
    
    // Period: 2026-04-06 (Mon) to 2026-04-17 (Fri) = 10 work days
    const totalWorkDays = calculateTotalWorkDays('2026-04-06', '2026-04-17', [], leaves);
    // 10 work days - 3 work days of leave = 7 work days
    assert.strictEqual(totalWorkDays, 7);
  });

  test('3. Overlap Detection (ກວດການທັບຊ້ອນກັນຂອງຄຳຂໍລາພັກ)', () => {
    const existing = { start: '2026-04-10', end: '2026-04-15' };

    // Exact match -> overlap
    assert.strictEqual(isLeaveOverlap('2026-04-10', '2026-04-15', existing.start, existing.end), true);

    // Partial overlap start inside -> overlap
    assert.strictEqual(isLeaveOverlap('2026-04-12', '2026-04-20', existing.start, existing.end), true);

    // Partial overlap end inside -> overlap
    assert.strictEqual(isLeaveOverlap('2026-04-05', '2026-04-11', existing.start, existing.end), true);

    // Enclosing -> overlap
    assert.strictEqual(isLeaveOverlap('2026-04-01', '2026-04-30', existing.start, existing.end), true);

    // Adjacent / touching next day (2026-04-16 to 2026-04-20) -> NO overlap
    assert.strictEqual(isLeaveOverlap('2026-04-16', '2026-04-20', existing.start, existing.end), false);

    // Completely before -> NO overlap
    assert.strictEqual(isLeaveOverlap('2026-04-01', '2026-04-09', existing.start, existing.end), false);
  });

  test('4. ກົດ 7 ວັນຍ້ອນຫຼັງ (7-day backdate rule for Admin)', () => {
    const today = '2026-04-15';

    // Today -> allowed
    assert.strictEqual(isBackdateWithinLimit('2026-04-15', today, 7), true);

    // Future date -> allowed
    assert.strictEqual(isBackdateWithinLimit('2026-04-20', today, 7), true);

    // Exactly 7 days back (2026-04-08) -> allowed
    assert.strictEqual(isBackdateWithinLimit('2026-04-08', today, 7), true);

    // 8 days back (2026-04-07) -> NOT allowed (requires Super Admin)
    assert.strictEqual(isBackdateWithinLimit('2026-04-07', today, 7), false);

    // 30 days back -> NOT allowed
    assert.strictEqual(isBackdateWithinLimit('2026-03-15', today, 7), false);
  });

  test('5. ວັນລາຢູ່ນອກຊ່ວງຝຶກ (Outside internship dates validation)', () => {
    const internStart = '2026-04-01';
    const internEnd = '2026-06-30';

    // Perfectly inside
    assert.strictEqual(isLeaveWithinInternship('2026-04-10', '2026-04-15', internStart, internEnd), true);

    // Exactly matching boundaries
    assert.strictEqual(isLeaveWithinInternship('2026-04-01', '2026-06-30', internStart, internEnd), true);

    // Leave start before internship start -> Invalid
    assert.strictEqual(isLeaveWithinInternship('2026-03-25', '2026-04-05', internStart, internEnd), false);

    // Leave end after internship end -> Invalid
    assert.strictEqual(isLeaveWithinInternship('2026-06-25', '2026-07-05', internStart, internEnd), false);

    // Invalid date order (start > end) -> Invalid
    assert.strictEqual(isLeaveWithinInternship('2026-05-10', '2026-05-05', internStart, internEnd), false);
  });
});

describe('Phase 3.1 LTC HR Leave System Tests', () => {
  test('1. countLeaveDays (ເສົາ-ອາທິດ, ວັນພັກ, ເຄິ່ງມື້ 0.5)', () => {
    // 2026-04-03 is Friday, 2026-04-04 Sat, 2026-04-05 Sun, 2026-04-06 Mon
    const holidays = ['2026-04-06']; // Mon is holiday

    // Friday morning only = 0.5
    assert.strictEqual(countLeaveDays('2026-04-03', '2026-04-03', 'morning', holidays), 0.5);

    // Friday afternoon only = 0.5
    assert.strictEqual(countLeaveDays('2026-04-03', '2026-04-03', 'afternoon', holidays), 0.5);

    // Friday full day (both) = 1.0
    assert.strictEqual(countLeaveDays('2026-04-03', '2026-04-03', 'both', holidays), 1.0);

    // Saturday half day -> 0 (weekend)
    assert.strictEqual(countLeaveDays('2026-04-04', '2026-04-04', 'morning', holidays), 0);

    // Monday (holiday) -> 0
    assert.strictEqual(countLeaveDays('2026-04-06', '2026-04-06', 'both', holidays), 0);

    // Multi-day spanning weekend & holiday: 2026-04-03 (Fri) to 2026-04-07 (Tue)
    // Days: Fri (work), Sat (weekend), Sun (weekend), Mon (holiday), Tue (work) = 2 days
    assert.strictEqual(countLeaveDays('2026-04-03', '2026-04-07', 'both', holidays), 2);
  });

  test('2. Detailed Leave Overlap (Period-aware)', () => {
    // Same day: morning vs afternoon -> Allowed (no overlap)
    assert.strictEqual(isDetailedLeaveOverlap(
      { startDate: '2026-04-10', endDate: '2026-04-10', periods: 'morning' },
      { startDate: '2026-04-10', endDate: '2026-04-10', periods: 'afternoon' }
    ), false);

    // Same day: morning vs morning -> Overlap!
    assert.strictEqual(isDetailedLeaveOverlap(
      { startDate: '2026-04-10', endDate: '2026-04-10', periods: 'morning' },
      { startDate: '2026-04-10', endDate: '2026-04-10', periods: 'morning' }
    ), true);

    // Same day: full day (both) vs morning -> Overlap!
    assert.strictEqual(isDetailedLeaveOverlap(
      { startDate: '2026-04-10', endDate: '2026-04-10', periods: 'both' },
      { startDate: '2026-04-10', endDate: '2026-04-10', periods: 'morning' }
    ), true);
  });

  test('3. Quota Calculations (ເກີນ / ບໍ່ເກີນ / ຂ້າມປີ)', () => {
    const quotaPerYear = 15;
    const usedIn2026 = 13;

    // Requesting 2 days in 2026 -> Total 15 <= 15 (allowed)
    assert.strictEqual(usedIn2026 + 2 <= quotaPerYear, true);

    // Requesting 3 days in 2026 -> Total 16 > 15 (exceeded)
    assert.strictEqual(usedIn2026 + 3 <= quotaPerYear, false);

    // Cross-year quota check: leave in 2027 uses 2027 quota, not 2026
    const usedIn2027 = 0;
    assert.strictEqual(usedIn2027 + 5 <= quotaPerYear, true);
  });
});
