import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyApiAuth, recordAuditLog } from '@/lib/api-auth';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';

// GET: ດຶງລາຍຊື່ພະແນກທັງໝົດ
export async function GET(req: NextRequest) {
  try {
    const snap = await adminDb.collection('departments').get();
    const departments = snap.docs.map((doc: QueryDocumentSnapshot) => ({
      id: doc.id,
      ...doc.data(),
    }));
    return NextResponse.json({ departments });
  } catch (error: any) {
    console.error('Error fetching departments:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: ສ້າງ ຫຼື ແກ້ໄຂພະແນກ (ສະເພາະ Super Admin)
export async function POST(req: NextRequest) {
  const authResult = await verifyApiAuth(req, ['superadmin']);
  if (!authResult.user) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status || 401 });
  }

  try {
    const body = await req.json();
    const { id, name, active = true } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'ກະລຸນາໃສ່ຊື່ພະແນກ' }, { status: 400 });
    }

    if (id) {
      // ແກ້ໄຂພະແນກທີ່ມີຢູ່
      const deptRef = adminDb.collection('departments').doc(id);
      const prevSnap = await deptRef.get();
      const prevData = prevSnap.exists ? prevSnap.data() : null;

      await deptRef.update({
        name: name.trim(),
        active: Boolean(active),
        updatedAt: new Date().toISOString(),
      });

      await recordAuditLog({
        actorId: authResult.user.uid,
        actorRole: authResult.user.role,
        action: 'UPDATE_DEPARTMENT',
        targetType: 'department',
        targetId: id,
        before: prevData,
        after: { name, active },
      });

      return NextResponse.json({ success: true, message: 'ອັບເດດພະແນກສຳເລັດ' });
    } else {
      // ສ້າງພະແນກໃໝ່
      const docRef = await adminDb.collection('departments').add({
        name: name.trim(),
        active: true,
        createdBy: authResult.user.uid,
        createdAt: new Date().toISOString(),
      });

      await recordAuditLog({
        actorId: authResult.user.uid,
        actorRole: authResult.user.role,
        action: 'CREATE_DEPARTMENT',
        targetType: 'department',
        targetId: docRef.id,
        after: { name, active: true },
      });

      return NextResponse.json({ success: true, id: docRef.id, message: 'ສ້າງພະແນກໃໝ່ສຳເລັດ' });
    }
  } catch (error: any) {
    console.error('Error in POST departments:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
