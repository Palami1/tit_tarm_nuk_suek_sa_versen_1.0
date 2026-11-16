import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyApiAuth } from '@/lib/api-auth';
import {
  findNearestOffice,
  isGpsAccurate,
  getVientianeDateString,
  getVientianeTimeString,
  canCheckOutWithHalfDay,
  determineCheckOutStatusWithHalfDay,
  calculateWorkHours,
  getServerNow,
  DEFAULT_SYSTEM_SETTINGS,
} from '@/lib/attendance-rules';
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
    const { latitude, longitude, accuracy } = body;

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json({ error: 'ບໍ່ພົບພິກັດ GPS ທີ່ຖືກຕ້ອງ' }, { status: 400 });
    }

    // 2. Load System Settings (with fallback to default)
    let settings = DEFAULT_SYSTEM_SETTINGS;
    try {
      const settingsSnap = await adminDb.collection('settings').doc('system').get();
      if (settingsSnap.exists) {
        settings = { ...DEFAULT_SYSTEM_SETTINGS, ...settingsSnap.data() } as SystemSettings;
      }
    } catch (sErr) {
      console.warn('Fallback to default settings');
    }

    // 3. Server Time via central getServerNow()
    const now = getServerNow();
    const todayDate = getVientianeDateString(now);
    const currentTimeStr = getVientianeTimeString(now);

    // 4. GPS Accuracy Check
    if (!isGpsAccurate(accuracy, settings.maxGpsAccuracy)) {
      return NextResponse.json(
        { error: `ສັນຍານ GPS ບໍ່ແມ່ນຍຳພໍ (${Math.round(accuracy)}m, ຕ້ອງການ <= ${settings.maxGpsAccuracy}m) ກະລຸນາລອງໃໝ່` },
        { status: 400 }
      );
    }

    // 5. Distance Check
    const nearest = findNearestOffice({ lat: latitude, lng: longitude }, settings.offices);
    if (!nearest.isInside || !nearest.office) {
      return NextResponse.json(
        {
          error: `ທ່ານຢູ່ໄກຈາກສະຖານທີ່ເຮັດວຽກ (${nearest.distance} ແມັດ, ຕ້ອງຢູ່ພາຍໃນ ${nearest.office?.radius || 200}m)`,
          distance: nearest.distance,
        },
        { status: 400 }
      );
    }

    // Check approved leave for today (ຮອງຮັບມື້ລາເຄິ່ງມື້)
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
        }
      }
    }

    // 6. Check-out Window Check (ຮອງຮັບມື້ລາເຄິ່ງມື້)
    const windowCheck = canCheckOutWithHalfDay(currentTimeStr, true, false, halfDayPeriod, settings);
    if (!windowCheck.allowed) {
      return NextResponse.json({ error: windowCheck.reason }, { status: 400 });
    }

    // 7. Determine Check-out Status ('normal' or 'early-leave' ພ້ອມຮອງຮັບມື້ລາເຄິ່ງມື້)
    const checkOutStatus = determineCheckOutStatusWithHalfDay(currentTimeStr, halfDayPeriod, settings);
    const checkOutTimeIso = now.toISOString();

    const docId = `${uid}_${todayDate}`;
    const attendanceRef = adminDb.collection('attendance').doc(docId);

    let calculatedWorkHours: number | null = null;
    let updatedData: any = null;

    // 8. Atomic Transaction to prevent race conditions and duplicate check-outs
    await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(attendanceRef);
      if (!snap.exists || !snap.data()?.checkInTime) {
        throw new Error('NOT_CHECKED_IN');
      }

      const currentRecord = snap.data()!;
      if (currentRecord.checkOutTime) {
        throw new Error('ALREADY_CHECKED_OUT');
      }

      calculatedWorkHours = calculateWorkHours(
        currentRecord.checkInTime,
        checkOutTimeIso,
        settings.lunchBreakHours,
        settings.lunchThresholdHours
      );

      const updatePayload = {
        checkOutTime: checkOutTimeIso,
        checkOutStatus,
        checkOutDistance: nearest.distance,
        checkOutCoords: { lat: latitude, lng: longitude },
      };

      transaction.update(attendanceRef, updatePayload);
      updatedData = { ...currentRecord, ...updatePayload, workHours: calculatedWorkHours };
    });

    return NextResponse.json({
      success: true,
      message: `ລົງເວລາອອກວຽກສຳເລັດ! (${checkOutStatus === 'normal' ? 'ປົກກະຕິ' : 'ອອກກ່ອນເວລາ'}) - ຊົ່ວໂມງເຮັດວຽກ: ${calculatedWorkHours ?? '—'} ຊມ`,
      data: updatedData,
    });
  } catch (error: any) {
    if (error.message === 'NOT_CHECKED_IN') {
      return NextResponse.json({ error: 'ທ່ານຕ້ອງລົງເວລາເຂົ້າວຽກ (Check-in) ກ່ອນຈຶ່ງຈະສາມາດອອກວຽກໄດ້' }, { status: 400 });
    }
    if (error.message === 'ALREADY_CHECKED_OUT') {
      return NextResponse.json({ error: 'ທ່ານໄດ້ລົງເວລາອອກວຽກ (Check-out) ສຳເລັດແລ້ວໃນມື້ນີ້' }, { status: 400 });
    }
    console.error('Check-out error:', error);
    return NextResponse.json({ error: 'ເກີດຂໍ້ຜິດພາດໃນການລົງເວລາ: ' + error.message }, { status: 500 });
  }
}
