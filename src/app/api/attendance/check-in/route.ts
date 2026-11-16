import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyApiAuth } from '@/lib/api-auth';
import {
  findNearestOffice,
  isGpsAccurate,
  getVientianeDateString,
  getVientianeTimeString,
  canCheckInWithHalfDay,
  determineCheckInStatusWithHalfDay,
  getServerNow,
  DEFAULT_SYSTEM_SETTINGS,
} from '@/lib/attendance-rules';
import { isWeekend } from '@/lib/workdays';
import { SystemSettings } from '@/types';

export async function POST(req: NextRequest) {
  // 1. Verify Authentication & Role
  const authResult = await verifyApiAuth(req, ['intern']);
  if (!authResult.user) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status || 401 });
  }

  const { uid, status } = authResult.user;
  if (status !== 'approved') {
    return NextResponse.json({ error: 'ບັນຊີຂອງທ່ານຍັງບໍ່ທັນໄດ້ຮັບການອະນຸມັດ ຫຼື ຖືກລະງັບ' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { latitude, longitude, accuracy, deviceInfo } = body;

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json({ error: 'ບໍ່ພົບພິກັດ GPS ທີ່ຖືກຕ້ອງ' }, { status: 400 });
    }

    // 2. Fetch User Profile (to verify dates and department/supervisor)
    const userSnap = await adminDb.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: 'ບໍ່ພົບຂໍ້ມູນຜູ້ໃຊ້' }, { status: 404 });
    }
    const userData = userSnap.data() || {};

    // 3. Load System Settings (with fallback to default if doc doesn't exist)
    let settings = DEFAULT_SYSTEM_SETTINGS;
    try {
      const settingsSnap = await adminDb.collection('settings').doc('system').get();
      if (settingsSnap.exists) {
        settings = { ...DEFAULT_SYSTEM_SETTINGS, ...settingsSnap.data() } as SystemSettings;
      }
    } catch (sErr) {
      console.warn('Fallback to default system settings');
    }

    // 4. Server Time via central getServerNow() (supports DEV_FAKE_NOW in non-production)
    const now = getServerNow();
    const todayDate = getVientianeDateString(now);
    const currentTimeStr = getVientianeTimeString(now);

    // 5. Date boundaries check: user startDate - endDate
    if (userData.startDate && todayDate < userData.startDate) {
      return NextResponse.json({ error: `ຍັງບໍ່ຮອດກຳນົດເລີ່ມຝຶກງານ (ເລີ່ມວັນທີ ${userData.startDate})` }, { status: 400 });
    }
    if (userData.endDate && todayDate > userData.endDate) {
      return NextResponse.json({ error: `ສິ້ນສຸດກຳນົດຝຶກງານແລ້ວ (ສິ້ນສຸດວັນທີ ${userData.endDate})` }, { status: 400 });
    }

    // 6. Workday Verification: Weekend, Holiday, Approved Leave
    if (isWeekend(todayDate)) {
      return NextResponse.json({ error: 'ມື້ນີ້ເປັນວັນທ້າຍອາທິດ (ວັນເສົາ-ອາທິດ) ບໍ່ມີການລົງເວລາ' }, { status: 400 });
    }

    // Check holidays collection
    const holidaySnap = await adminDb.collection('holidays').doc(todayDate).get();
    if (holidaySnap.exists) {
      const holidayName = holidaySnap.data()?.name || 'ວັນພັກລັດຖະການ';
      return NextResponse.json({ error: `ມື້ນີ້ເປັນວັນພັກ: ${holidayName}` }, { status: 400 });
    }

    // Check approved leave (Full-day vs Half-day)
    const leaveSnap = await adminDb
      .collection('leave_requests')
      .where('userId', '==', uid)
      .where('status', '==', 'approved')
      .where('startDate', '<=', todayDate)
      .get();

    let halfDayPeriod: 'morning' | 'afternoon' | 'none' = 'none';
    for (const doc of leaveSnap.docs) {
      const l = doc.data();
      if (todayDate >= l.startDate && todayDate <= l.endDate) {
        if (l.startDate === l.endDate && (l.periods === 'morning' || l.periods === 'afternoon')) {
          halfDayPeriod = l.periods;
        } else {
          return NextResponse.json({ error: 'ມື້ນີ້ທ່ານຢູ່ໃນຊ່ວງລາພັກເຕັມມື້ທີ່ໄດ້ຮັບການອະນຸມັດແລ້ວ' }, { status: 400 });
        }
      }
    }

    // 7. Check-in Window (ຮອງຮັບມື້ລາເຄິ່ງມື້)
    const windowCheck = canCheckInWithHalfDay(currentTimeStr, halfDayPeriod, settings);
    if (!windowCheck.allowed) {
      return NextResponse.json({ error: windowCheck.reason }, { status: 400 });
    }

    // 8. GPS Accuracy Check (<= maxGpsAccuracy)
    if (!isGpsAccurate(accuracy, settings.maxGpsAccuracy)) {
      return NextResponse.json(
        { error: `ສັນຍານ GPS ບໍ່ແມ່ນຍຳພໍ (Accuracy: ${Math.round(accuracy)}m, ຕ້ອງການ <= ${settings.maxGpsAccuracy}m) ກະລຸນາລອງໃໝ່` },
        { status: 400 }
      );
    }

    // 9. Haversine Distance Check (<= radius)
    const nearest = findNearestOffice({ lat: latitude, lng: longitude }, settings.offices);
    if (!nearest.isInside || !nearest.office) {
      return NextResponse.json(
        {
          error: `ທ່ານຢູ່ໄກຈາກສະຖານທີ່ເຮັດວຽກ (${nearest.distance} ແມັດ, ຕ້ອງຢູ່ພາຍໃນ ${nearest.office?.radius || 200}m ຂອງ ${nearest.office?.name || 'ຫ້ອງການ'})`,
          distance: nearest.distance,
        },
        { status: 400 }
      );
    }

    // 10. Determine Check-in Status ('on-time' or 'late' ພ້ອມຮອງຮັບມື້ລາເຄິ່ງມື້)
    const checkInStatus = determineCheckInStatusWithHalfDay(currentTimeStr, halfDayPeriod, settings);

    // 11. Prepare record including supervisorId & departmentId
    const docId = `${uid}_${todayDate}`;
    const attendanceRef = adminDb.collection('attendance').doc(docId);

    const attendanceData = {
      userId: uid,
      userName: userData.fullname || authResult.user.email,
      departmentId: userData.departmentId || null,
      supervisorId: userData.supervisorId || null,
      date: todayDate,
      checkInTime: now.toISOString(),
      checkInStatus,
      checkInDistance: nearest.distance,
      checkInCoords: { lat: latitude, lng: longitude },
      checkInAccuracy: Math.round(accuracy),
      checkOutTime: null,
      checkOutStatus: null,
      checkOutDistance: null,
      checkOutCoords: null,
      deviceInfo: deviceInfo || null,
      adjustedBy: null,
      adjustedReason: null,
      adjustedAt: null,
    };

    // 12. Atomic Transaction to prevent duplicate check-ins
    await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(attendanceRef);
      if (snap.exists && snap.data()?.checkInTime) {
        throw new Error('ALREADY_CHECKED_IN');
      }
      transaction.set(attendanceRef, attendanceData);
    });

    return NextResponse.json({
      success: true,
      message: `ລົງເວລາເຂົ້າວຽກສຳເລັດ! (${checkInStatus === 'on-time' ? 'ທັນເວລາ' : 'ມາຊ້າ'})`,
      data: attendanceData,
    });
  } catch (error: any) {
    if (error.message === 'ALREADY_CHECKED_IN') {
      return NextResponse.json({ error: 'ທ່ານໄດ້ລົງເວລາເຂົ້າວຽກສຳລັບມື້ນີ້ແລ້ວ' }, { status: 400 });
    }
    console.error('Check-in error:', error);
    return NextResponse.json({ error: 'ເກີດຂໍ້ຜິດພາດໃນການລົງເວລາ: ' + error.message }, { status: 500 });
  }
}
