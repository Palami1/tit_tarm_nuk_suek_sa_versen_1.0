import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyApiAuth, recordAuditLog } from '@/lib/api-auth';

// POST: Intern ຍົກເລີກຄຳຂໍລາພັກຂອງຕົນເອງ (ຕາບໃດທີ່ຍັງ pending)
export async function POST(req: NextRequest) {
  const authResult = await verifyApiAuth(req, ['intern']);
  if (!authResult.user) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status || 401 });
  }

  const { uid } = authResult.user;

  try {
    const body = await req.json();
    const { requestId } = body;

    if (!requestId) {
      return NextResponse.json({ error: 'ກະລຸນາລະບຸ requestId' }, { status: 400 });
    }

    const docRef = adminDb.collection('leave_requests').doc(requestId);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'ບໍ່ພົບຄຳຂໍລາພັກນີ້' }, { status: 404 });
    }

    const data = snap.data()!;
    if (data.userId !== uid) {
      return NextResponse.json({ error: 'ທ່ານບໍ່ມີສິດຍົກເລີກຄຳຂໍຂອງຜູ້ອື່ນ' }, { status: 403 });
    }

    if (data.status !== 'pending') {
      return NextResponse.json({ error: `ບໍ່ສາມາດຍົກເລີກໄດ້ ເນື່ອງຈາກຄຳຂໍຢູ່ໃນສະຖານະ: ${data.status}` }, { status: 400 });
    }

    await docRef.update({
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
    });

    await recordAuditLog({
      actorId: uid,
      actorRole: 'intern',
      action: 'CANCEL_LEAVE_REQUEST',
      targetType: 'leave_request',
      targetId: requestId,
      before: { status: 'pending' },
      after: { status: 'cancelled' },
      reason: 'Cancelled by intern',
    });

    return NextResponse.json({
      success: true,
      message: 'ຍົກເລີກຄຳຂໍລາພັກຮຽບຮ້ອຍແລ້ວ',
    });
  } catch (error: any) {
    console.error('Cancel leave error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
