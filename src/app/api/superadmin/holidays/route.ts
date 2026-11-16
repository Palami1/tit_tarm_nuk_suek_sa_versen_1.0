import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyApiAuth, recordAuditLog } from '@/lib/api-auth';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';

// GET: ດຶງລາຍຊື່ວັນພັກທັງໝົດ
export async function GET(req: NextRequest) {
  try {
    const snap = await adminDb.collection('holidays').get();
    const holidays = snap.docs
      .map((d: QueryDocumentSnapshot) => ({
        date: d.id,
        ...d.data(),
      }))
      .sort((a: any, b: any) => a.date.localeCompare(b.date));

    return NextResponse.json({ holidays });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: ເພີ່ມວັນພັກໃໝ່ (ສະເພາະ Super Admin)
export async function POST(req: NextRequest) {
  const authResult = await verifyApiAuth(req, ['superadmin']);
  if (!authResult.user) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status || 401 });
  }

  const { uid, role } = authResult.user;

  try {
    const body = await req.json();
    const { date, name } = body;

    if (!date || !name?.trim()) {
      return NextResponse.json({ error: 'ກະລຸນາລະບຸວັນທີ (YYYY-MM-DD) ແລະ ຊື່ວັນພັກ' }, { status: 400 });
    }

    const docRef = adminDb.collection('holidays').doc(date);
    const existing = await docRef.get();

    const payload = {
      name: name.trim(),
      createdBy: uid,
      createdAt: new Date().toISOString(),
    };

    await docRef.set(payload, { merge: true });

    // Record audit log
    await recordAuditLog({
      actorId: uid,
      actorRole: role,
      action: existing.exists ? 'UPDATE_HOLIDAY' : 'CREATE_HOLIDAY',
      targetType: 'holiday',
      targetId: date,
      before: existing.exists ? existing.data() : null,
      after: payload,
      reason: `Holiday ${name} on ${date} saved by Super Admin`,
    });

    return NextResponse.json({
      success: true,
      message: 'ບັນທຶກວັນພັກສຳເລັດແລ້ວ',
      data: { date, ...payload },
    });
  } catch (error: any) {
    console.error('Save holiday error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: ລຶບວັນພັກ (ສະເພາະ Super Admin)
export async function DELETE(req: NextRequest) {
  const authResult = await verifyApiAuth(req, ['superadmin']);
  if (!authResult.user) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status || 401 });
  }

  const { uid, role } = authResult.user;

  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json({ error: 'ກະລຸນາລະບຸ parameter date' }, { status: 400 });
    }

    const docRef = adminDb.collection('holidays').doc(date);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'ບໍ່ພົບວັນພັກນີ້' }, { status: 404 });
    }

    const prevData = snap.data();
    await docRef.delete();

    // Record audit log
    await recordAuditLog({
      actorId: uid,
      actorRole: role,
      action: 'DELETE_HOLIDAY',
      targetType: 'holiday',
      targetId: date,
      before: prevData,
      after: null,
      reason: `Holiday ${prevData?.name || date} deleted by Super Admin`,
    });

    return NextResponse.json({
      success: true,
      message: 'ລຶບວັນພັກສຳເລັດແລ້ວ',
    });
  } catch (error: any) {
    console.error('Delete holiday error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
