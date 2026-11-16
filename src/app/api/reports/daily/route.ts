import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyApiAuth } from '@/lib/api-auth';
import { getVientianeDateString, getServerNow } from '@/lib/attendance-rules';

// GET: ດຶງບົດລາຍງານຂອງມື້ນີ້
export async function GET(req: NextRequest) {
  const authResult = await verifyApiAuth(req, ['intern', 'admin', 'superadmin']);
  if (!authResult.user) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status || 401 });
  }

  const { uid } = authResult.user;
  const todayDate = getVientianeDateString(getServerNow());
  const docId = `${uid}_${todayDate}`;

  try {
    const reportSnap = await adminDb.collection('daily_reports').doc(docId).get();
    const data = reportSnap.exists ? { id: reportSnap.id, ...reportSnap.data() } : null;

    return NextResponse.json({ report: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: ສົ່ງ ຫຼື ແກ້ໄຂບົດລາຍງານປະຈຳວັນ (ສະເພາະມື້ທີ່ມີ check-in)
export async function POST(req: NextRequest) {
  const authResult = await verifyApiAuth(req, ['intern']);
  if (!authResult.user) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status || 401 });
  }

  const { uid, status } = authResult.user;
  if (status !== 'approved') {
    return NextResponse.json({ error: 'ບັນຊີຍັງບໍ່ໄດ້ຮັບການອະນຸມັດ' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { report } = body;

    if (!report || !report.trim()) {
      return NextResponse.json({ error: 'ກະລຸນາປ້ອນເນື້ອຫາບົດລາຍງານ' }, { status: 400 });
    }

    const now = getServerNow();
    const todayDate = getVientianeDateString(now);

    // 1. ກວດສອບວ່າຕ້ອງມີ Check-in ໃນມື້ນີ້ກ່ອນ
    const attendanceDocId = `${uid}_${todayDate}`;
    const attendanceSnap = await adminDb.collection('attendance').doc(attendanceDocId).get();

    if (!attendanceSnap.exists || !attendanceSnap.data()?.checkInTime) {
      return NextResponse.json(
        { error: 'ທ່ານຕ້ອງລົງເວລາເຂົ້າວຽກ (Check-in) ໃນມື້ນີ້ກ່ອນ ຈຶ່ງຈະສາມາດສົ່ງລາຍງານປະຈຳວັນໄດ້' },
        { status: 400 }
      );
    }

    // 2. ດຶງຂໍ້ມູນຜູ້ໃຊ້ ເພື່ອບັນທຶກ departmentId & supervisorId
    const userSnap = await adminDb.collection('users').doc(uid).get();
    const userData = userSnap.data() || {};
    const userName = userData.fullname || authResult.user.email;

    // 3. ບັນທຶກ ຫຼື ອັບເດດລົງ doc: daily_reports/{uid}_{YYYY-MM-DD}
    const reportDocId = `${uid}_${todayDate}`;
    const reportRef = adminDb.collection('daily_reports').doc(reportDocId);
    const existingSnap = await reportRef.get();

    const nowIso = now.toISOString();

    if (existingSnap.exists) {
      // ແກ້ໄຂພາຍໃນມື້ນັ້ນ
      await reportRef.update({
        report: report.trim(),
        departmentId: userData.departmentId || null,
        supervisorId: userData.supervisorId || null,
        reviewStatus: 'pending', // ຣີເຊັດເປັນ pending ໃຫ້ admin ກວດໃໝ່
        updatedAt: nowIso,
      });

      return NextResponse.json({
        success: true,
        message: 'ອັບເດດບົດລາຍງານປະຈຳວັນສຳເລັດ!',
        docId: reportDocId,
      });
    } else {
      // ສ້າງໃໝ່
      const newReportData = {
        userId: uid,
        userName,
        departmentId: userData.departmentId || null,
        supervisorId: userData.supervisorId || null,
        date: todayDate,
        report: report.trim(),
        adminComment: null,
        reviewStatus: 'pending',
        reviewedBy: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await reportRef.set(newReportData);

      return NextResponse.json({
        success: true,
        message: 'ສົ່ງບົດລາຍງານປະຈຳວັນສຳເລັດ!',
        docId: reportDocId,
      });
    }
  } catch (error: any) {
    console.error('Daily report submission error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
