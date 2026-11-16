import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  calculateAttendancePerformance,
  calculateWeightedAttendancePerformance,
  determineGrade,
  getGradeStatus,
  getGradeDetails,
} from '../src/lib/grading.ts';

describe('Grading System Tests', () => {
  test('calculateAttendancePerformance returns null if daysPassed = 0', () => {
    assert.strictEqual(calculateAttendancePerformance(0, 0), null);
    assert.strictEqual(calculateAttendancePerformance(5, 0), null);
  });

  test('calculateAttendancePerformance computes correct percentage', () => {
    assert.strictEqual(calculateAttendancePerformance(10, 10), 100);
    assert.strictEqual(calculateAttendancePerformance(8, 10), 80);
    assert.strictEqual(calculateAttendancePerformance(7, 10), 70);
    assert.strictEqual(calculateAttendancePerformance(1, 3), 33);
  });

  test('determineGrade edge cases for thresholds (A >= 80, B >= 70, C >= 60, D >= 50, F < 50)', () => {
    assert.strictEqual(determineGrade(null), '—');

    // Boundary for A (>= 80)
    assert.strictEqual(determineGrade(100), 'A');
    assert.strictEqual(determineGrade(80), 'A'); // exactly 80%
    assert.strictEqual(determineGrade(79), 'B'); // 79% is B

    // Boundary for B (>= 70)
    assert.strictEqual(determineGrade(70), 'B'); // exactly 70%
    assert.strictEqual(determineGrade(69), 'C'); // 69% is C

    // Boundary for C (>= 60)
    assert.strictEqual(determineGrade(60), 'C'); // exactly 60%
    assert.strictEqual(determineGrade(59), 'D'); // 59% is D

    // Boundary for D (>= 50)
    assert.strictEqual(determineGrade(50), 'D'); // exactly 50%
    assert.strictEqual(determineGrade(49), 'F'); // 49% is F (fail)
    assert.strictEqual(determineGrade(0), 'F');
  });

  test('getGradeStatus distinguishes provisional vs final', () => {
    // Before end date -> provisional
    assert.strictEqual(getGradeStatus('2026-04-10', '2026-04-30'), 'provisional');

    // Exactly end date -> final
    assert.strictEqual(getGradeStatus('2026-04-30', '2026-04-30'), 'final');

    // After end date -> final
    assert.strictEqual(getGradeStatus('2026-05-01', '2026-04-30'), 'final');
  });

  test('getGradeDetails outputs correct Lao label and color class', () => {
    const detailA = getGradeDetails(85, false);
    assert.strictEqual(detailA.grade, 'A');
    assert.ok(detailA.label.includes('(ຊົ່ວຄາວ)'));

    const detailBFinal = getGradeDetails(75, true);
    assert.strictEqual(detailBFinal.grade, 'B');
    assert.ok(detailBFinal.label.includes('(ສຸດທ້າຍ)'));
  });

  test('calculateWeightedAttendancePerformance handles day weights & leave fractions', () => {
    // 4 passed workdays: Day 1, Day 2, Day 3, Day 4
    const passed = ['2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09'];

    // Day 3 is full day leave (fraction = 1.0 -> weight = 0)
    // Day 4 is half day leave (fraction = 0.5 -> weight = 0.5)
    // Denominator = 1 + 1 + 0 + 0.5 = 2.5
    const fractions = new Map<string, number>([
      ['2026-04-08', 1.0],
      ['2026-04-09', 0.5],
    ]);

    // Attended Day 1, Day 2, and Day 4
    // Numerator = 1 + 1 + 0.5 = 2.5 -> 100%
    const attended = new Set(['2026-04-06', '2026-04-07', '2026-04-09']);
    const result100 = calculateWeightedAttendancePerformance(passed, attended, fractions);
    assert.strictEqual(result100.numerator, 2.5);
    assert.strictEqual(result100.denominator, 2.5);
    assert.strictEqual(result100.performancePercent, 100);

    // Attended Day 1 and Day 2 only (missed Day 4)
    // Numerator = 1 + 1 + 0 = 2.0 -> 2.0 / 2.5 = 80%
    const attended2 = new Set(['2026-04-06', '2026-04-07']);
    const result80 = calculateWeightedAttendancePerformance(passed, attended2, fractions);
    assert.strictEqual(result80.numerator, 2);
    assert.strictEqual(result80.denominator, 2.5);
    assert.strictEqual(result80.performancePercent, 80);

    // Edge case: Intern checks in on full day leave (Day 3)
    // Weight is 0, so numerator does NOT add Day 3 and does NOT exceed 100%
    const attendedWithLeaveDay = new Set(['2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09']);
    const resultNoInflate = calculateWeightedAttendancePerformance(passed, attendedWithLeaveDay, fractions);
    assert.strictEqual(resultNoInflate.numerator, 2.5); // Day 3 added 0
    assert.strictEqual(resultNoInflate.denominator, 2.5);
    assert.strictEqual(resultNoInflate.performancePercent, 100);
  });
});
