import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyApiAuth, recordAuditLog } from '@/lib/api-auth';
import { LeaveType } from '@/types';

// GET: ດຶງປະເພດການລາພັກທັງໝົດສຳລັບ Super Admin
export async function GET(req: NextRequest) {
  try {
    const { user, error, status } = await verifyApiAuth(req, ['superadmin', 'admin']);
    if (error || !user) {
      return NextResponse.json({ error }, { status: status || 401 });
    }

    const snap = await adminDb.collection('leave_types').orderBy('order', 'asc').get();
    const leaveTypes = snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveType));

    return NextResponse.json({ leaveTypes });
  } catch (err: any) {
    console.error('Fetch leave types error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: ສ້າງ ຫຼື ແກ້ໄຂປະເພດການລາພັກ
export async function POST(req: NextRequest) {
  try {
    const { user, error, status } = await verifyApiAuth(req, ['superadmin']);
    if (error || !user) {
      return NextResponse.json({ error }, { status: status || 401 });
    }

    const body = await req.json();
    const { id, name, quotaPerYear, requiresDocument, active, order } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'ກະລຸນາໃສ່ຊື່ປະເພດການລາພັກ' }, { status: 400 });
    }

    const docId = id ? String(id).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') : `lt_${Date.now()}`;
    const docRef = adminDb.collection('leave_types').doc(docId);
    const existingSnap = await docRef.get();
    const beforeState = existingSnap.exists ? existingSnap.data() : null;

    const payload = {
      name: name.trim(),
      quotaPerYear: quotaPerYear === '' || quotaPerYear === null || isNaN(Number(quotaPerYear)) ? null : Math.max(0, Number(quotaPerYear)),
      requiresDocument: Boolean(requiresDocument),
      active: active !== false,
      order: Number(order) || 1,
      updatedAt: new Date().toISOString(),
    };

    if (!existingSnap.exists) {
      (payload as any).createdAt = new Date().toISOString();
      await docRef.set(payload);
    } else {
      await docRef.update(payload);
    }

    // Record Audit Log
    await recordAuditLog({
      actorId: user.uid,
      actorRole: user.role,
      action: existingSnap.exists ? 'UPDATE_LEAVE_TYPE' : 'CREATE_LEAVE_TYPE',
      targetType: 'leave_type',
      targetId: docId,
      before: beforeState,
      after: payload,
      reason: `Super Admin configured leave type ${name}`,
    });

    return NextResponse.json({
      success: true,
      message: `ບັນທຶກປະເພດການລາ "${name}" ຮຽບຮ້ອຍແລ້ວ`,
      leaveType: { id: docId, ...payload },
    });
  } catch (err: any) {
    console.error('Save leave type error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
