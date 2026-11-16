import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyApiAuth, recordAuditLog } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  try {
    const { user, error, status } = await verifyApiAuth(req, ['admin', 'superadmin']);
    if (error || !user) {
      return NextResponse.json({ error }, { status: status || 401 });
    }

    const body = await req.json();
    const { reportId, adminComment, reviewStatus } = body;

    if (!reportId) {
      return NextResponse.json({ error: 'ກະລຸນາລະບຸ reportId' }, { status: 400 });
    }

    if (!['approved', 'needs-revision'].includes(reviewStatus)) {
      return NextResponse.json({ error: 'ສະຖານະ reviewStatus ຕ້ອງເປັນ approved ຫຼື needs-revision' }, { status: 400 });
    }

    const reportRef = adminDb.collection('daily_reports').doc(reportId);
    const reportSnap = await reportRef.get();

    if (!reportSnap.exists) {
      return NextResponse.json({ error: 'ບໍ່ພົບບົດລາຍງານນີ້' }, { status: 404 });
    }

    const reportData = reportSnap.data() || {};

    // ກວດສອບສິດ: ຖ້າເປັນ Admin ຕ້ອງເປັນ Supervisor ຂອງ Intern ຄົນນີ້
    if (user.role === 'admin') {
      let isSupervisor = reportData.supervisorId === user.uid;
      if (!isSupervisor && reportData.userId) {
        const internSnap = await adminDb.collection('users').doc(reportData.userId).get();
        if (internSnap.exists && internSnap.data()?.supervisorId === user.uid) {
          isSupervisor = true;
        }
      }

      if (!isSupervisor) {
        return NextResponse.json({ error: 'ທ່ານບໍ່ມີສິດກວດສອບບົດລາຍງານຂອງນັກສຶກສານອກທີມ' }, { status: 403 });
      }
    }

    const beforeState = {
      adminComment: reportData.adminComment || null,
      reviewStatus: reportData.reviewStatus || 'pending',
      reviewedBy: reportData.reviewedBy || null,
    };

    const nowIso = new Date().toISOString();
    const updatePayload = {
      adminComment: adminComment ? String(adminComment).trim() : '',
      reviewStatus,
      reviewedBy: user.uid,
      reviewedByName: user.email,
      reviewedAt: nowIso,
      updatedAt: nowIso,
    };

    await reportRef.update(updatePayload);

    // ບັນທຶກ Audit Log
    await recordAuditLog({
      actorId: user.uid,
      actorRole: user.role,
      action: 'review_daily_report',
      targetType: 'daily_report',
      targetId: reportId,
      before: beforeState,
      after: updatePayload,
      reason: `Admin reviewed report: status changed to ${reviewStatus}`,
    });

    return NextResponse.json({
      success: true,
      message: 'ບັນທຶກການກວດສອບບົດລາຍງານສຳເລັດແລ້ວ',
      report: {
        id: reportId,
        ...reportData,
        ...updatePayload,
      },
    });
  } catch (err: any) {
    console.error('Error reviewing daily report:', err);
    return NextResponse.json({ error: 'ເກີດຂໍ້ຜິດພາດ: ' + err.message }, { status: 500 });
  }
}
