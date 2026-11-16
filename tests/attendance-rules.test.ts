import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  calculateDistance,
  findNearestOffice,
  isGpsAccurate,
  canCheckIn,
  determineCheckInStatus,
  canCheckOut,
  determineCheckOutStatus,
  calculateWorkHours,
  getDerivedAttendanceStatus,
  parseTimeToSeconds,
  canCheckInWithHalfDay,
  determineCheckInStatusWithHalfDay,
  canCheckOutWithHalfDay,
  determineCheckOutStatusWithHalfDay,
  DEFAULT_OFFICES,
} from '../src/lib/attendance-rules.ts';

describe('1. GPS & Geofence Tests', () => {
  test('Haversine distance between identical coords should be 0', () => {
    const dist = calculateDistance(17.9699, 102.6123, 17.9699, 102.6123);
    assert.strictEqual(dist, 0);
  });

  test('HQ point should be inside 200m radius of HQ', () => {
    const hq = DEFAULT_OFFICES[0];
    const result = findNearestOffice({ lat: hq.lat, lng: hq.lng }, DEFAULT_OFFICES);
    assert.strictEqual(result.isInside, true);
    assert.strictEqual(result.distance, 0);
  });

  test('Point far away (>200m) should be marked as outside', () => {
    // 1 km away
    const result = findNearestOffice({ lat: 17.9800, lng: 102.6123 }, DEFAULT_OFFICES);
    assert.strictEqual(result.isInside, false);
    assert.ok(result.distance > 200);
  });

  test('GPS accuracy checks: <= 50m valid, > 50m invalid', () => {
    assert.strictEqual(isGpsAccurate(10), true);
    assert.strictEqual(isGpsAccurate(50), true); // Boundary: exactly 50m
    assert.strictEqual(isGpsAccurate(50.1), false); // Over boundary
    assert.strictEqual(isGpsAccurate(100), false);
    assert.strictEqual(isGpsAccurate(-5), false);
  });
});

describe('2. Check-in Rules & Edge Cases', () => {
  test('Can check-in only between 06:00:00 and 12:00:00', () => {
    assert.strictEqual(canCheckIn('05:59:59').allowed, false);
    assert.strictEqual(canCheckIn('06:00:00').allowed, true); // Boundary: 06:00
    assert.strictEqual(canCheckIn('08:00:00').allowed, true);
    assert.strictEqual(canCheckIn('12:00:00').allowed, true); // Boundary: 12:00
    assert.strictEqual(canCheckIn('12:00:01').allowed, false);
  });

  test('Cutoff at 08:00:00: exactly 08:00:00 is on-time', () => {
    assert.strictEqual(determineCheckInStatus('07:59:59'), 'on-time');
    assert.strictEqual(determineCheckInStatus('08:00:00'), 'on-time'); // Boundary: 08:00:00
  });

  test('Cutoff at 08:00:00: 08:00:01 is late (no grace default)', () => {
    assert.strictEqual(determineCheckInStatus('08:00:01'), 'late'); // Boundary: 08:00:01
    assert.strictEqual(determineCheckInStatus('08:15:00'), 'late');
  });

  test('Grace period support if configured', () => {
    // With 15 minutes grace: 08:15:00 is on-time, 08:15:01 is late
    assert.strictEqual(determineCheckInStatus('08:15:00', '08:00', 15), 'on-time');
    assert.strictEqual(determineCheckInStatus('08:15:01', '08:00', 15), 'late');
  });
});

describe('3. Check-out Rules & Edge Cases', () => {
  test('Cannot check-out without check-in first', () => {
    const res = canCheckOut('17:00:00', false, false);
    assert.strictEqual(res.allowed, false);
  });

  test('Cannot check-out twice', () => {
    const res = canCheckOut('17:00:00', true, true);
    assert.strictEqual(res.allowed, false);
  });

  test('Can check-out within window 12:00:00 - 22:00:00', () => {
    assert.strictEqual(canCheckOut('11:59:59', true, false).allowed, false);
    assert.strictEqual(canCheckOut('12:00:00', true, false).allowed, true);
    assert.strictEqual(canCheckOut('17:00:00', true, false).allowed, true);
    assert.strictEqual(canCheckOut('22:00:00', true, false).allowed, true);
    assert.strictEqual(canCheckOut('22:00:01', true, false).allowed, false);
  });

  test('Early leave cutoff at 17:00:00: < 17:00:00 is early-leave, >= 17:00:00 is normal', () => {
    assert.strictEqual(determineCheckOutStatus('16:59:59'), 'early-leave');
    assert.strictEqual(determineCheckOutStatus('17:00:00'), 'normal'); // Boundary: exactly 17:00:00
    assert.strictEqual(determineCheckOutStatus('17:05:00'), 'normal');
  });
});

describe('4. Work Hours Calculation', () => {
  test('Deducts 1 hour lunch break when total work hours > 5 hours', () => {
    // 08:00 to 17:00 = 9 hours -> minus 1h = 8 hours
    const hours = calculateWorkHours('2026-04-06T08:00:00.000Z', '2026-04-06T17:00:00.000Z');
    assert.strictEqual(hours, 8);
  });

  test('Does not deduct lunch break when working <= 5 hours', () => {
    // 08:00 to 12:30 = 4.5 hours -> 4.5 hours
    const hours = calculateWorkHours('2026-04-06T08:00:00.000Z', '2026-04-06T12:30:00.000Z');
    assert.strictEqual(hours, 4.5);
  });

  test('Returns null if check-out is missing', () => {
    const hours = calculateWorkHours('2026-04-06T08:00:00.000Z', null);
    assert.strictEqual(hours, null);
  });
});

describe('5. Derived Check-out Status on Read', () => {
  test('Completed record retains normal or early-leave', () => {
    const record = {
      date: '2026-04-06',
      checkInTime: '2026-04-06T08:00:00.000Z',
      checkOutTime: '2026-04-06T17:00:00.000Z',
      checkOutStatus: 'normal' as const,
    };
    const derived = getDerivedAttendanceStatus(record);
    assert.strictEqual(derived.checkoutStatus, 'normal');
    assert.strictEqual(derived.isComplete, true);
  });

  test('Past date with no checkout is derived as forgot-checkout', () => {
    const record = {
      date: '2026-04-01',
      checkInTime: '2026-04-01T08:00:00.000Z',
      checkOutTime: null,
      checkOutStatus: null,
    };
    // Pretend today is 2026-04-02
    const fakeNow = new Date('2026-04-02T10:00:00.000Z');
    const derived = getDerivedAttendanceStatus(record, fakeNow);
    assert.strictEqual(derived.checkoutStatus, 'forgot-checkout');
    assert.strictEqual(derived.isComplete, false);
  });
});

describe('6. Half-day Leave Attendance Rules (Phase 3.1)', () => {
  test('Morning Leave (Afternoon Work): Check-in cutoff 13:00:00 & window up to 16:00', () => {
    // Check-in Window: 06:00 to 16:00
    assert.strictEqual(canCheckInWithHalfDay('05:59:59', 'morning').allowed, false);
    assert.strictEqual(canCheckInWithHalfDay('06:00:00', 'morning').allowed, true);
    assert.strictEqual(canCheckInWithHalfDay('13:00:00', 'morning').allowed, true);
    assert.strictEqual(canCheckInWithHalfDay('16:00:00', 'morning').allowed, true);
    assert.strictEqual(canCheckInWithHalfDay('16:00:01', 'morning').allowed, false);

    // Status: <= 13:00:00 is on-time; > 13:00:00 is late
    assert.strictEqual(determineCheckInStatusWithHalfDay('12:59:59', 'morning'), 'on-time');
    assert.strictEqual(determineCheckInStatusWithHalfDay('13:00:00', 'morning'), 'on-time');
    assert.strictEqual(determineCheckInStatusWithHalfDay('13:00:01', 'morning'), 'late');
    assert.strictEqual(determineCheckInStatusWithHalfDay('14:30:00', 'morning'), 'late');
  });

  test('Afternoon Leave (Morning Work): Check-out cutoff 12:00:00 & window starting 11:00', () => {
    // Check-in is normal (<= 08:00:00 is on-time)
    assert.strictEqual(determineCheckInStatusWithHalfDay('08:00:00', 'afternoon'), 'on-time');
    assert.strictEqual(determineCheckInStatusWithHalfDay('08:00:01', 'afternoon'), 'late');

    // Check-out Window: 11:00 to 22:00
    assert.strictEqual(canCheckOutWithHalfDay('10:59:59', true, false, 'afternoon').allowed, false);
    assert.strictEqual(canCheckOutWithHalfDay('11:00:00', true, false, 'afternoon').allowed, true);
    assert.strictEqual(canCheckOutWithHalfDay('12:00:00', true, false, 'afternoon').allowed, true);

    // Status: >= 12:00:00 is normal; < 12:00:00 is early-leave
    assert.strictEqual(determineCheckOutStatusWithHalfDay('11:59:59', 'afternoon'), 'early-leave');
    assert.strictEqual(determineCheckOutStatusWithHalfDay('12:00:00', 'afternoon'), 'normal');
    assert.strictEqual(determineCheckOutStatusWithHalfDay('12:15:00', 'afternoon'), 'normal');
  });
});
