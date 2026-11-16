import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyApiAuth, recordAuditLog } from '@/lib/api-auth';

const VALID_GRADES = ['A', 'B', 'C', 'D', 'F'];

export async function POST(req: NextRequest) {
  try {
    const { user, error, status } = await verifyApiAuth(req, ['admin', 'superadmin']);
    if (error || !user) {
      return NextResponse.json({ error }, { status: status || 401 });
    }

    const body = await req.json();
    const { internId, grade, proposedNote } = body;

    if (!internId) {
      return NextResponse.json({ error: 'ກະລຸນາລະບຸ internId' }, { status: 400 });
    }

    if (!grade || !VALID_GRADES.includes(grade.toUpperCase())) {
      return NextResponse.json({
        error: `ເກຣດບໍ່ຖືກຕ້ອງ. ຕ້ອງເປັນໜຶ່ງໃນ: ${VALID_GRADES.join(', ')}`,
      }, { status: 400 });
    }

    const internRef = adminDb.collection('users').doc(internId);
    const internSnap = await internRef.get();

    if (!internSnap.exists) {
      return NextResponse.json({ error: 'ບໍ່ພົບຂໍ້ມູນນັກສຶກສານີ້' }, { status: 404 });
    }

    const internData = internSnap.data() || {};

    // ກວດສອບສິດ: Admin ສະເໜີໄດ້ສະເພາະທີມຕົນເອງ
    if (user.role === 'admin' && internData.supervisorId !== user.uid) {
      return NextResponse.json({ error: 'ທ່ານບໍ່ມີສິດສະເໜີເກຣດໃຫ້ນັກສຶກສານອກທີມ' }, { status: 403 });
    }

    // ດຶງຂໍ້ມູນ admin name ສຳລັບສະແດງ
    const adminUserSnap = await adminDb.collection('users').doc(user.uid).get();
    const adminFullName = adminUserSnap.exists ? adminUserSnap.data()?.fullname : user.email;

    const beforeGrade = internData.finalGrade || null;
    const nowIso = new Date().toISOString();

    const proposedGradePayload = {
      grade: grade.toUpperCase(),
      proposedBy: user.uid,
      proposedByName: adminFullName || user.email,
      proposedAt: nowIso,
      proposedNote: proposedNote ? String(proposedNote).trim() : '',
      status: 'pending_approval', // ລໍຖ້າ Superadmin ອະນຸມັດ
      approvedBy: null,
      approvedAt: null,
    };

    await internRef.update({
      finalGrade: proposedGradePayload,
      updatedAt: nowIso,
    });

    // ບັນທຶກ Audit Log
    await recordAuditLog({
      actorId: user.uid,
      actorRole: user.role,
      action: 'propose_final_grade',
      targetType: 'user',
      targetId: internId,
      before: { finalGrade: beforeGrade },
      after: { finalGrade: proposedGradePayload },
      reason: `Admin proposed grade ${grade.toUpperCase()} with note: "${proposedNote || ''}"`,
    });

    return NextResponse.json({
      success: true,
      message: `ສະເໜີເກຣດ ${grade.toUpperCase()} ໃຫ້ Super Admin ອະນຸມັດຮຽບຮ້ອຍແລ້ວ`,
      finalGrade: proposedGradePayload,
    });
  } catch (err: any) {
    console.error('Error proposing final grade:', err);
    return NextResponse.json({ error: 'ເກີດຂໍ້ຜິດພາດ: ' + err.message }, { status: 500 });
  }
}
