import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyApiAuth, recordAuditLog } from '@/lib/api-auth';
import { getVientianeDateString, getServerNow, DEFAULT_SYSTEM_SETTINGS } from '@/lib/attendance-rules';
import { SystemSettings } from '@/types';

// POST: Admin ຫຼື Super Admin ອະນຸມັດ / ປະຕິເສດ / ຍົກເລີກຄຳຂໍລາພັກ
export async function POST(req: NextRequest) {
  const authResult = await verifyApiAuth(req, ['admin', 'superadmin']);
  if (!authResult.user) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status || 401 });
  }

  const { uid, role } = authResult.user;

  try {
    const body = await req.json();
    const { requestId, action, reviewNote } = body;

    if (!requestId || !action || !['approve', 'reject', 'revoke'].includes(action)) {
      return NextResponse.json(
        { error: 'ກະລຸນາລະບຸ requestId ແລະ action ("approve", "reject" ຫຼື "revoke")' },
        { status: 400 }
      );
    }

    const docRef = adminDb.collection('leave_requests').doc(requestId);

    let updatedResult: any = null;

    // Load System Settings for backdate rule
    let settings = DEFAULT_SYSTEM_SETTINGS;
    try {
      const sSnap = await adminDb.collection('settings').doc('system').get();
      if (sSnap.exists) settings = { ...DEFAULT_SYSTEM_SETTINGS, ...sSnap.data() } as SystemSettings;
    } catch (e) {}

    const maxBackdateDays = settings.leaveApprovalBackdateDays || 7;
    const todayStr = getVientianeDateString(getServerNow());

    // Run atomic transaction
    await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists) {
        throw new Error('NOT_FOUND');
      }

      const data = snap.data()!;

      // 1. ກວດສອບຂອບເຂດທີມຂອງ Admin (Super Admin ຂ້າມໄດ້)
      if (role === 'admin') {
        const internUserSnap = await transaction.get(adminDb.collection('users').doc(data.userId));
        const internSupervisorId = internUserSnap.exists ? internUserSnap.data()?.supervisorId : null;

        const isSupervisor = data.supervisorId === uid || internSupervisorId === uid;
        if (!isSupervisor) {
          throw new Error('FORBIDDEN_NOT_TEAM');
        }

        // ກວດສອບກົດ 7 ວັນຍ້ອນຫຼັງ (ສະເພາະຕອນ approve / reject)
        if (action === 'approve' || action === 'reject') {
          const startDate = new Date(data.startDate);
          const today = new Date(todayStr);
          const diffDays = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

          if (diffDays > maxBackdateDays) {
            throw new Error('BACKDATE_EXCEEDED');
          }
        }
      }

      // 2. ກວດສອບສະຖານະປັດຈຸບັນ
      if (action === 'approve' || action === 'reject') {
        if (data.status !== 'pending') {
          throw new Error(`STATUS_NOT_PENDING:${data.status}`);
        }
      } else if (action === 'revoke') {
        if (data.status !== 'approved') {
          throw new Error(`STATUS_NOT_APPROVED:${data.status}`);
        }
        if (!reviewNote || !reviewNote.trim()) {
          throw new Error('REVOKE_REASON_REQUIRED');
        }
      }

      // 3. ອັບເດດສະຖານະ
      let newStatus = data.status;
      if (action === 'approve') newStatus = 'approved';
      else if (action === 'reject') newStatus = 'rejected';
      else if (action === 'revoke') newStatus = 'cancelled';

      const nowIso = getServerNow().toISOString();
      const updatePayload: Record<string, any> = {
        status: newStatus,
        reviewedBy: uid,
        reviewNote: reviewNote?.trim() || null,
        reviewedAt: nowIso,
      };

      if (action === 'revoke') {
        updatePayload.revokedBy = uid;
        updatePayload.revokedAt = nowIso;
        updatePayload.revokeReason = reviewNote?.trim() || 'Revoked by admin';
      }

      transaction.update(docRef, updatePayload);
      updatedResult = { id: requestId, ...data, ...updatePayload };
    });

    // 4. ບັນທຶກ Audit Log
    await recordAuditLog({
      actorId: uid,
      actorRole: role,
      action: `LEAVE_${action.toUpperCase()}`,
      targetType: 'leave_request',
      targetId: requestId,
      before: { status: action === 'revoke' ? 'approved' : 'pending' },
      after: { status: updatedResult.status, reviewNote },
      reason: reviewNote || `Leave request ${action} by ${role}`,
    });

    const actionText =
      action === 'approve' ? 'ອະນຸມັດ' : action === 'reject' ? 'ປະຕິເສດ' : 'ຍົກເລີກການລາພັກທີ່ອະນຸມັດແລ້ວ';

    return NextResponse.json({
      success: true,
      message: `${actionText} ສຳເລັດແລ້ວ`,
      data: updatedResult,
    });
  } catch (error: any) {
    if (error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'ບໍ່ພົບຄຳຂໍລາພັກນີ້' }, { status: 404 });
    }
    if (error.message === 'FORBIDDEN_NOT_TEAM') {
      return NextResponse.json({ error: 'ທ່ານສາມາດຈັດການໄດ້ສະເພາະນັກສຶກສາໃນທີມຂອງທ່ານເທົ່ານັ້ນ' }, { status: 403 });
    }
    if (error.message === 'BACKDATE_EXCEEDED') {
      return NextResponse.json(
        { error: 'ຄຳຂໍລາພັກນີ້ຍ້ອນຫຼັງເກີນ 7 ວັນ. ຕາມລະບຽບຕ້ອງໃຫ້ Super Admin ເປັນຜູ້ອະນຸມັດເທົ່ານັ້ນ' },
        { status: 403 }
      );
    }
    if (error.message?.startsWith('STATUS_NOT_PENDING')) {
      const cur = error.message.split(':')[1];
      return NextResponse.json({ error: `ຄຳຂໍນີ້ບໍ່ໄດ້ຢູ່ໃນສະຖານະລໍຖ້າອະນຸມັດ (ສະຖານະປັດຈຸບັນ: ${cur})` }, { status: 400 });
    }
    if (error.message?.startsWith('STATUS_NOT_APPROVED')) {
      const cur = error.message.split(':')[1];
      return NextResponse.json({ error: `ສາມາດຍົກເລີກໄດ້ສະເພາະຄຳຂໍທີ່ອະນຸມັດແລ້ວເທົ່ານັ້ນ (ສະຖານະປັດຈຸບັນ: ${cur})` }, { status: 400 });
    }
    if (error.message === 'REVOKE_REASON_REQUIRED') {
      return NextResponse.json({ error: 'ກະລຸນາໃສ່ເຫດຜົນໃນການຍົກເລີກການລາພັກ' }, { status: 400 });
    }

    console.error('Review leave error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
