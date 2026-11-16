import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyApiAuth } from '@/lib/api-auth';
import { getVientianeDateString, getServerNow } from '@/lib/attendance-rules';
import { countLeaveDays, isDetailedLeaveOverlap } from '@/lib/workdays';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { LeavePeriod } from '@/types';

// GET: ດຶງລາຍການຂໍລາພັກ
export async function GET(req: NextRequest) {
  const authResult = await verifyApiAuth(req, ['intern', 'admin', 'superadmin']);
  if (!authResult.user) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status || 401 });
  }

  const { uid, role } = authResult.user;

  try {
    let requests: any[] = [];

    if (role === 'intern') {
      // Intern: ເບິ່ງສະເພາະຂອງຕົນ
      const snap = await adminDb
        .collection('leave_requests')
        .where('userId', '==', uid)
        .get();

      requests = snap.docs.map((d: QueryDocumentSnapshot) => ({ id: d.id, ...d.data() }));
    } else if (role === 'admin') {
      // Admin: ເບິ່ງສະເພາະນັກສຶກສາໃນທີມຕົນ (supervisorId == uid)
      const snap = await adminDb
        .collection('leave_requests')
        .where('supervisorId', '==', uid)
        .get();

      requests = snap.docs.map((d: QueryDocumentSnapshot) => ({ id: d.id, ...d.data() }));
    } else {
      // Super Admin: ເບິ່ງໄດ້ທັງໝົດ
      const snap = await adminDb.collection('leave_requests').get();
      requests = snap.docs.map((d: QueryDocumentSnapshot) => ({ id: d.id, ...d.data() }));
    }

    requests.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    return NextResponse.json({ requests });
  } catch (error: any) {
    console.error('Error fetching leave requests:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Intern ຍື່ນຄຳຂໍລາພັກ (LTC HR Leave Management System)
export async function POST(req: NextRequest) {
  const authResult = await verifyApiAuth(req, ['intern']);
  if (!authResult.user) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status || 401 });
  }

  const { uid, status } = authResult.user;
  if (status !== 'approved') {
    return NextResponse.json({ error: 'ບັນຊີຍັງບໍ່ທັນໄດ້ຮັບການອະນຸມັດ' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      leaveTypeId,
      startDate,
      endDate,
      periods = 'both',
      reason,
      attachmentId = null,
    } = body;

    if (!leaveTypeId) {
      return NextResponse.json({ error: 'ກະລຸນາເລືອກປະເພດການລາພັກ' }, { status: 400 });
    }

    if (!startDate || !endDate || !reason?.trim()) {
      return NextResponse.json({ error: 'ກະລຸນາເລືອກວັນທີເລີ່ມ, ວັນທີສິ້ນສຸດ ແລະ ໃສ່ເຫດຜົນການລາ' }, { status: 400 });
    }

    if (startDate > endDate) {
      return NextResponse.json({ error: 'ວັນທີເລີ່ມລາ ຕ້ອງບໍ່ເກີນ ວັນທີສິ້ນສຸດການລາ' }, { status: 400 });
    }

    // 1. ກວດສອບປະເພດການລາພັກ
    const leaveTypeSnap = await adminDb.collection('leave_types').doc(leaveTypeId).get();
    if (!leaveTypeSnap.exists || leaveTypeSnap.data()?.active === false) {
      return NextResponse.json({ error: 'ປະເພດການລາພັກນີ້ບໍ່ມີໃນລະບົບ ຫຼື ຖືກປິດໃຊ້ງານແລ້ວ' }, { status: 400 });
    }
    const leaveTypeData = leaveTypeSnap.data() || {};

    // 2. ກວດສອບຊ່ວງເວລາ (periods)
    let finalPeriods: LeavePeriod = 'both';
    if (startDate === endDate) {
      if (!['morning', 'afternoon', 'both'].includes(periods)) {
        return NextResponse.json({ error: 'ກະລຸນາເລືອກຊ່ວງເວລາ: ຊ່ວງເຊົ້າ, ຊ່ວງແລງ, ຫຼື ເຕັມມື້' }, { status: 400 });
      }
      finalPeriods = periods as LeavePeriod;
    } else {
      // ຖ້າລາຫຼາຍມື້ ບັງຄັບເຕັມມື້ (both)
      finalPeriods = 'both';
    }

    // 3. ກວດສອບ: ຫ້າມຍື່ນຍ້ອນຫຼັງ (startDate ຕ້ອງ >= ມື້ນີ້ຕາມເວລາ Server Asia/Vientiane)
    const todayDate = getVientianeDateString(getServerNow());
    if (startDate < todayDate) {
      return NextResponse.json(
        { error: `ບໍ່ອະນຸຍາດຍື່ນຄຳຂໍລາພັກຍ້ອນຫຼັງ (ວັນທີເລີ່ມລາ ຕ້ອງເລີ່ມຕັ້ງແຕ່ມື້ນີ້ເປັນຕົ້ນໄປ: ${todayDate})` },
        { status: 400 }
      );
    }

    // 4. ກວດສອບຊ່ວງຝຶກງານຂອງ Intern
    const userSnap = await adminDb.collection('users').doc(uid).get();
    const userData = userSnap.data() || {};

    if (userData.startDate && startDate < userData.startDate) {
      return NextResponse.json({ error: `ວັນທີລາພັກຕ້ອງຢູ່ໃນຊ່ວງຝຶກງານ (ເລີ່ມວັນທີ ${userData.startDate})` }, { status: 400 });
    }
    if (userData.endDate && endDate > userData.endDate) {
      return NextResponse.json({ error: `ວັນທີລາພັກຕ້ອງຢູ່ໃນຊ່ວງຝຶກງານ (ສິ້ນສຸດວັນທີ ${userData.endDate})` }, { status: 400 });
    }

    // 5. ດຶງວັນພັກ (holidays) ເພື່ອຄິດໄລ່ຈຳນວນມື້ລາ
    const holidaysSnap = await adminDb.collection('holidays').get();
    const holidaysList = holidaysSnap.docs.map(d => d.id);

    const calculatedDays = countLeaveDays(startDate, endDate, finalPeriods, holidaysList);
    if (calculatedDays <= 0) {
      return NextResponse.json({
        error: 'ວັນທີທີ່ທ່ານເລືອກເປັນວັນເສົາ-ອາທິດ ຫຼື ວັນພັກລັດຖະການທັງໝົດ (0 ມື້)',
      }, { status: 400 });
    }

    // 6. ກວດສອບເອກະສານແນບ (requiresDocument)
    if (leaveTypeData.requiresDocument) {
      if (!attachmentId) {
        return NextResponse.json({
          error: `ການລາປະເພດ "${leaveTypeData.name}" ບັງຄັບໃຫ້ແນບເອກະສານຢັ້ງຢືນ (ເຊັ່ນ: ໃບຢັ້ງຢືນແພດ / ໜັງສືທາງການ)`,
        }, { status: 400 });
      }

      const attachSnap = await adminDb.collection('leave_attachments').doc(attachmentId).get();
      if (!attachSnap.exists || attachSnap.data()?.userId !== uid) {
        return NextResponse.json({ error: 'ບໍ່ພົບເອກະສານແນບ ຫຼື ທ່ານບໍ່ແມ່ນເຈົ້າຂອງເອກະສານ' }, { status: 400 });
      }
    }

    // 7. ກວດສອບການທັບຊ້ອນ (Overlap Check) ກັບຄຳຂໍເກົ່າທີ່ pending ຫຼື approved
    const existingSnap = await adminDb
      .collection('leave_requests')
      .where('userId', '==', uid)
      .where('status', 'in', ['pending', 'approved'])
      .get();

    const isOverlap = existingSnap.docs.some((doc: QueryDocumentSnapshot) => {
      const ex = doc.data();
      return isDetailedLeaveOverlap(
        { startDate, endDate, periods: finalPeriods },
        { startDate: ex.startDate, endDate: ex.endDate, periods: ex.periods || 'both' }
      );
    });

    if (isOverlap) {
      return NextResponse.json(
        { error: 'ທ່ານມີຄຳຂໍລາພັກທີ່ກຳລັງລໍຖ້າ ຫຼື ໄດ້ຮັບການອະນຸມັດແລ້ວໃນຊ່ວງເວລານີ້' },
        { status: 400 }
      );
    }

    // 8. ກວດສອບໂຄຕ້າປະຈຳປີ (Quota Check)
    if (leaveTypeData.quotaPerYear !== null && typeof leaveTypeData.quotaPerYear === 'number') {
      const currentYear = startDate.substring(0, 4);

      let usedDaysInYear = 0;
      existingSnap.docs.forEach((doc: QueryDocumentSnapshot) => {
        const ex = doc.data();
        if (
          (ex.leaveTypeId === leaveTypeId || (!ex.leaveTypeId && leaveTypeId === 'annual')) &&
          ex.startDate &&
          ex.startDate.startsWith(currentYear)
        ) {
          usedDaysInYear += Number(ex.days) || 1;
        }
      });

      if (usedDaysInYear + calculatedDays > leaveTypeData.quotaPerYear) {
        const remaining = Math.max(0, leaveTypeData.quotaPerYear - usedDaysInYear);
        return NextResponse.json({
          error: `ໂຄຕ້າການລາປະເພດ "${leaveTypeData.name}" ບໍ່ພຽງພໍ (ໂຄຕ້າທັງໝົດ: ${leaveTypeData.quotaPerYear} ມື້/ປີ, ໃຊ້ໄປແລ້ວ: ${usedDaysInYear} ມື້, ເຫຼືອ: ${remaining} ມື້, ທ່ານກຳລັງຂໍ: ${calculatedDays} ມື້)`,
        }, { status: 400 });
      }
    }

    // 9. ບັນທຶກຄຳຂໍລາພັກລົງ Firestore
    const nowIso = new Date().toISOString();
    const newDocRef = await adminDb.collection('leave_requests').add({
      userId: uid,
      userName: userData.fullname || authResult.user.email,
      departmentId: userData.departmentId || null,
      supervisorId: userData.supervisorId || null,
      leaveTypeId,
      leaveTypeName: leaveTypeData.name,
      startDate,
      endDate,
      periods: finalPeriods,
      days: calculatedDays,
      reason: reason.trim(),
      hasAttachment: !!attachmentId,
      attachmentId: attachmentId || null,
      status: 'pending',
      reviewedBy: null,
      reviewedByName: null,
      reviewNote: null,
      reviewedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    return NextResponse.json({
      success: true,
      message: 'ຍື່ນຄຳຂໍລາພັກສຳເລັດແລ້ວ ກະລຸນາລໍຖ້າການອະນຸມັດ',
      requestId: newDocRef.id,
      days: calculatedDays,
    });
  } catch (error: any) {
    console.error('Error submitting leave request:', error);
    return NextResponse.json({ error: 'ເກີດຂໍ້ຜິດພາດ: ' + error.message }, { status: 500 });
  }
}
