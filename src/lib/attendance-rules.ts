import type { OfficeLocation, SystemSettings } from '../types/index.ts';

// Default HQ Coordinates: Lao Telecom Headquarters, Vientiane
export const DEFAULT_OFFICES: OfficeLocation[] = [
  {
    name: 'LTC Headquarter (ສຳນັກງານໃຫຍ່)',
    lat: 17.969900946492515,
    lng: 102.6123789072009,
    radius: 200,
    active: true,
  },
];

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  offices: DEFAULT_OFFICES,
  workStart: '08:00',
  workEnd: '17:00',
  graceMinutes: 0,
  checkInWindow: { from: '06:00', to: '12:00' },
  checkOutWindow: { from: '12:00', to: '22:00' },
  lunchBreakHours: 1,
  lunchThresholdHours: 5,
  maxGpsAccuracy: 50,
  leaveApprovalBackdateDays: 7,
  gradeThresholds: { A: 80, B: 70, C: 60, D: 50 },
  timezone: 'Asia/Vientiane',
  halfDay: {
    morningLeave: {
      checkInWindow: { from: '06:00', to: '16:00' },
      checkInCutoff: '13:00:00',
      checkOutCutoff: '17:00:00',
    },
    afternoonLeave: {
      checkInCutoff: '08:00:00',
      checkOutWindow: { from: '11:00', to: '22:00' },
      checkOutCutoff: '12:00:00',
    },
  },
};

/**
 * ສູດ Haversine Formula: ຄິດໄລ່ໄລຍະຫ່າງລະຫວ່າງ 2 ພິກັດ GPS (ເປັນແມັດ)
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * ກວດສອບວ່າພິກັດຂອງ User ຢູ່ໃນລັດສະໝີຂອງ Office ໃດໜຶ່ງທີ່ Active ບໍ່
 */
export function findNearestOffice(
  userCoords: { lat: number; lng: number },
  offices: OfficeLocation[] = DEFAULT_OFFICES
): { office: OfficeLocation | null; distance: number; isInside: boolean } {
  const activeOffices = offices.filter(o => o.active);
  if (activeOffices.length === 0) {
    return { office: null, distance: Infinity, isInside: false };
  }

  let nearestOffice = activeOffices[0];
  let minDistance = calculateDistance(userCoords.lat, userCoords.lng, nearestOffice.lat, nearestOffice.lng);

  for (let i = 1; i < activeOffices.length; i++) {
    const o = activeOffices[i];
    const dist = calculateDistance(userCoords.lat, userCoords.lng, o.lat, o.lng);
    if (dist < minDistance) {
      minDistance = dist;
      nearestOffice = o;
    }
  }

  return {
    office: nearestOffice,
    distance: minDistance,
    isInside: minDistance <= nearestOffice.radius,
  };
}

/**
 * ກວດສອບຄວາມແມ່ນຍຳຂອງສັນຍານ GPS (accuracy ຕ້ອງ <= maxAllowed)
 */
export function isGpsAccurate(accuracy: number, maxAllowed = 50): boolean {
  return typeof accuracy === 'number' && accuracy > 0 && accuracy <= maxAllowed;
}

/**
 * ແປງເວລາ string "HH:MM" ຫຼື "HH:MM:SS" ເປັນຈຳນວນວິນາທີນັບແຕ່ຕອນ 00:00:00
 */
export function parseTimeToSeconds(timeStr: string): number {
  const parts = timeStr.trim().split(':').map(Number);
  const hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  const seconds = parts[2] || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * ດຶງເວລາປັດຈຸບັນຂອງ Server
 * ຮອງຮັບ DEV_FAKE_NOW ສະເພາະຕອນ NODE_ENV !== 'production' ເພື່ອຄວາມສະດວກໃນການທົດສອບ
 * ຖ້າເປັນ Production ຈະໃຊ້ເວລາຈິງສະເໝີ 100% (ປ້ອງກັນການແຊກແຊງເວລາ)
 */
export function getServerNow(): Date {
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_FAKE_NOW) {
    const fake = new Date(process.env.DEV_FAKE_NOW);
    if (!isNaN(fake.getTime())) {
      return fake;
    }
  }
  return new Date();
}

/**
 * ດຶງວັນທີໃນເຂດເວລາ Asia/Vientiane (UTC+7) ຮູບແບບ "YYYY-MM-DD"
 */
export function getVientianeDateString(date: Date = getServerNow()): string {
  // Use Intl.DateTimeFormat for reliable timezone conversion
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Vientiane',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // Output format: YYYY-MM-DD
}

/**
 * ດຶງເວລາໃນເຂດເວລາ Asia/Vientiane (UTC+7) ຮູບແບບ "HH:MM:SS" (24-hour)
 */
export function getVientianeTimeString(date: Date = getServerNow()): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Vientiane',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return formatter.format(date);
}

/**
 * ກວດສອບວ່າເວລານີ້ຢູ່ໃນຊ່ວງທີ່ອະນຸຍາດໃຫ້ Check-in ບໍ່ (06:00:00 - 12:00:00)
 */
export function canCheckIn(
  currentTimeStr: string,
  window: { from: string; to: string } = { from: '06:00', to: '12:00' }
): { allowed: boolean; reason?: string } {
  const currentSec = parseTimeToSeconds(currentTimeStr);
  const fromSec = parseTimeToSeconds(window.from);
  const toSec = parseTimeToSeconds(window.to);

  if (currentSec < fromSec) {
    return { allowed: false, reason: `ຍັງບໍ່ຮອດເວລາລົງເວລາເຂົ້າ (ເປີດ ${window.from}:00)` };
  }
  if (currentSec > toSec) {
    return { allowed: false, reason: `ເກີນເວລາລົງເວລາເຂົ້າແລ້ວ (ປິດ ${window.to}:00)` };
  }
  return { allowed: true };
}

/**
 * ກຳນົດສະຖານະ Check-in: 'on-time' ຫຼື 'late'
 * ກົດ: ເວລາ <= workStart + graceMinutes (ຄ່າເລີ່ມຕົ້ນ 08:00:00 + 0min) -> on-time
 *      ເວລາຫຼັງຈາກນັ້ນ (08:00:01 ເປັນຕົ້ນໄປ) -> late
 */
export function determineCheckInStatus(
  checkInTimeStr: string,
  workStart = '08:00',
  graceMinutes = 0
): 'on-time' | 'late' {
  const checkInSec = parseTimeToSeconds(checkInTimeStr);
  const cutoffSec = parseTimeToSeconds(workStart) + graceMinutes * 60;

  return checkInSec <= cutoffSec ? 'on-time' : 'late';
}

/**
 * ກຳນົດສະຖານະ Check-in ຮອງຮັບມື້ລາເຄິ່ງມື້:
 * - ລາຮອບເຊົ້າ (ມາວຽກຕອນບ່າຍ): ທັນເວລາຖ້າ <= 13:00:00 (ຫຼັງຈາກນັ້ນ = ມາຊ້າ)
 * - ອື່ນໆ: ທັນເວລາຖ້າ <= 08:00:00 + graceMinutes
 */
export function determineCheckInStatusWithHalfDay(
  checkInTimeStr: string,
  halfDayPeriod: 'morning' | 'afternoon' | 'none' = 'none',
  settings: SystemSettings = DEFAULT_SYSTEM_SETTINGS
): 'on-time' | 'late' {
  if (halfDayPeriod === 'morning') {
    const cutoff = settings.halfDay?.morningLeave?.checkInCutoff || '13:00:00';
    const checkInSec = parseTimeToSeconds(checkInTimeStr);
    const cutoffSec = parseTimeToSeconds(cutoff);
    return checkInSec <= cutoffSec ? 'on-time' : 'late';
  }

  return determineCheckInStatus(checkInTimeStr, settings.workStart, settings.graceMinutes);
}

/**
 * ກວດສອບວ່າສາມາດ Check-in ໄດ້ບໍ່ (ຮອງຮັບມື້ລາເຄິ່ງມື້)
 */
export function canCheckInWithHalfDay(
  currentTimeStr: string,
  halfDayPeriod: 'morning' | 'afternoon' | 'none' = 'none',
  settings: SystemSettings = DEFAULT_SYSTEM_SETTINGS
): { allowed: boolean; reason?: string } {
  let window = settings.checkInWindow || { from: '06:00', to: '12:00' };

  if (halfDayPeriod === 'morning') {
    window = settings.halfDay?.morningLeave?.checkInWindow || { from: '06:00', to: '16:00' };
  }

  return canCheckIn(currentTimeStr, window);
}

/**
 * ກວດສອບວ່າສາມາດ Check-out ໄດ້ບໍ່ (12:00:00 - 22:00:00 ແລະ ຕ້ອງ Check-in ກ່ອນ)
 */
export function canCheckOut(
  currentTimeStr: string,
  hasCheckedIn: boolean,
  hasCheckedOut: boolean,
  window: { from: string; to: string } = { from: '12:00', to: '22:00' }
): { allowed: boolean; reason?: string } {
  if (!hasCheckedIn) {
    return { allowed: false, reason: 'ທ່ານຍັງບໍ່ທັນໄດ້ລົງເວລາເຂົ້າວຽກ (Check-in)' };
  }
  if (hasCheckedOut) {
    return { allowed: false, reason: 'ທ່ານໄດ້ລົງເວລາອອກວຽກ (Check-out) ສຳເລັດແລ້ວ' };
  }

  const currentSec = parseTimeToSeconds(currentTimeStr);
  const fromSec = parseTimeToSeconds(window.from);
  const toSec = parseTimeToSeconds(window.to);

  if (currentSec < fromSec) {
    return { allowed: false, reason: `ຍັງບໍ່ຮອດຊ່ວງເວລາລົງເວລາອອກ (ເລີ່ມ ${window.from}:00)` };
  }
  if (currentSec > toSec) {
    return { allowed: false, reason: `ເກີນເວລາລົງເວລາອອກແລ້ວ (ປິດ ${window.to}:00)` };
  }
  return { allowed: true };
}

/**
 * ກຳນົດສະຖານະ Check-out: 'normal' ຫຼື 'early-leave'
 * ກົດ: ເວລາ < 17:00:00 -> early-leave
 *      ເວລາ >= 17:00:00 -> normal
 */
export function determineCheckOutStatus(
  checkOutTimeStr: string,
  workEnd = '17:00'
): 'normal' | 'early-leave' {
  const checkOutSec = parseTimeToSeconds(checkOutTimeStr);
  const workEndSec = parseTimeToSeconds(workEnd);

  return checkOutSec >= workEndSec ? 'normal' : 'early-leave';
}

/**
 * ກຳນົດສະຖານະ Check-out ຮອງຮັບມື້ລາເຄິ່ງມື້:
 * - ລາຮອບແລງ (ມາວຽກຕອນເຊົ້າ): ປົກກະຕິຖ້າ >= 12:00:00 (ກ່ອນນັ້ນ = ອອກກ່ອນເວລາ)
 * - ອື່ນໆ: ປົກກະຕິຖ້າ >= 17:00:00 (ກ່ອນນັ້ນ = ອອກກ່ອນເວລາ)
 */
export function determineCheckOutStatusWithHalfDay(
  checkOutTimeStr: string,
  halfDayPeriod: 'morning' | 'afternoon' | 'none' = 'none',
  settings: SystemSettings = DEFAULT_SYSTEM_SETTINGS
): 'normal' | 'early-leave' {
  if (halfDayPeriod === 'afternoon') {
    const cutoff = settings.halfDay?.afternoonLeave?.checkOutCutoff || '12:00:00';
    const checkOutSec = parseTimeToSeconds(checkOutTimeStr);
    const cutoffSec = parseTimeToSeconds(cutoff);
    return checkOutSec >= cutoffSec ? 'normal' : 'early-leave';
  }

  return determineCheckOutStatus(checkOutTimeStr, settings.workEnd);
}

/**
 * ກວດສອບວ່າສາມາດ Check-out ໄດ້ບໍ່ (ຮອງຮັບມື້ລາເຄິ່ງມື້)
 */
export function canCheckOutWithHalfDay(
  currentTimeStr: string,
  hasCheckedIn: boolean,
  hasCheckedOut: boolean,
  halfDayPeriod: 'morning' | 'afternoon' | 'none' = 'none',
  settings: SystemSettings = DEFAULT_SYSTEM_SETTINGS
): { allowed: boolean; reason?: string } {
  let window = settings.checkOutWindow || { from: '12:00', to: '22:00' };

  if (halfDayPeriod === 'afternoon') {
    window = settings.halfDay?.afternoonLeave?.checkOutWindow || { from: '11:00', to: '22:00' };
  }

  return canCheckOut(currentTimeStr, hasCheckedIn, hasCheckedOut, window);
}

/**
 * ຄິດໄລ່ຊົ່ວໂມງເຮັດວຽກຕົວຈິງ
 * ກົດ: checkOut - checkIn; ຖ້າ > 5h ໃຫ້ຫັກພັກທ່ຽງ 1h; ຕ່ຳສຸດ 0.
 * ຖ້າບໍ່ມີ checkout ໃຫ້ສົ່ງຄືນ null
 */
export function calculateWorkHours(
  checkInIso: string,
  checkOutIso: string | null,
  lunchBreakHours = 1,
  lunchThresholdHours = 5
): number | null {
  if (!checkOutIso) return null;

  const inTime = new Date(checkInIso).getTime();
  const outTime = new Date(checkOutIso).getTime();
  if (isNaN(inTime) || isNaN(outTime) || outTime <= inTime) return 0;

  const diffHours = (outTime - inTime) / (1000 * 60 * 60);
  if (diffHours > lunchThresholdHours) {
    return Math.max(0, parseFloat((diffHours - lunchBreakHours).toFixed(1)));
  }
  return parseFloat(diffHours.toFixed(1));
}

/**
 * ສະຖານະ Check-out ແບບ Derived ຕອນອ່ານ (On Read)
 * ຖ້າບໍ່ມີ checkout:
 * - ຖ້າວັນທີຜ່ານໄປແລ້ວ ຫຼື ເວລາມື້ນີ້ເກີນ 22:00 -> 'forgot-checkout'
 * - ຖ້າຍັງຢູ່ໃນມື້ນັ້ນ ແລະ ບໍ່ຮອດ 22:00 -> 'working'
 */
export function getDerivedAttendanceStatus(
  record: {
    date: string;
    checkInTime: string;
    checkOutTime: string | null;
    checkOutStatus: 'normal' | 'early-leave' | null;
  },
  now: Date = new Date()
): {
  checkoutStatus: 'normal' | 'early-leave' | 'forgot-checkout' | 'working';
  isComplete: boolean;
} {
  if (record.checkOutTime) {
    return {
      checkoutStatus: record.checkOutStatus === 'early-leave' ? 'early-leave' : 'normal',
      isComplete: true,
    };
  }

  // Check if date has passed or current time is past 22:00
  const todayVientiane = getVientianeDateString(now);
  const currentTimeVientiane = getVientianeTimeString(now);
  const currentSec = parseTimeToSeconds(currentTimeVientiane);
  const cutoff22Sec = parseTimeToSeconds('22:00:00');

  if (record.date < todayVientiane || (record.date === todayVientiane && currentSec >= cutoff22Sec)) {
    return {
      checkoutStatus: 'forgot-checkout',
      isComplete: false,
    };
  }

  return {
    checkoutStatus: 'working',
    isComplete: false,
  };
}

/**
 * ກວດສອບວ່າລືມ check-out ບໍ່ (Forgot Checkout)
 */
export function isForgotCheckout(
  date: string,
  checkOutTime: string | null,
  now: Date = new Date()
): boolean {
  if (checkOutTime) return false;
  const status = getDerivedAttendanceStatus({
    date,
    checkInTime: '',
    checkOutTime: null,
    checkOutStatus: null,
  }, now);
  return status.checkoutStatus === 'forgot-checkout';
}
