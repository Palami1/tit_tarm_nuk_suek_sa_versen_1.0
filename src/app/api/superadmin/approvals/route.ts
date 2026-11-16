import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { verifyApiAuth, recordAuditLog } from '@/lib/api-auth';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';

// Helper: Batch update documents in chunks of 450 to support > 500 docs limit
async function batchUpdateInternDocuments(
  internId: string,
  newDepartmentId: string | null,
  newSupervisorId: string | null
): Promise<{ attendanceCount: number; reportsCount: number; leaveCount: number }> {
  const collections = [
    { name: 'attendance', key: 'attendanceCount' as const },
    { name: 'daily_reports', key: 'reportsCount' as const },
    { name: 'leave_requests', key: 'leaveCount' as const },
  ];

  const totalCounts = { attendanceCount: 0, reportsCount: 0, leaveCount: 0 };
  const nowIso = new Date().toISOString();

  for (const { name, key } of collections) {
    const snap = await adminDb.collection(name).where('userId', '==', internId).get();
    if (snap.empty) continue;

    const docs = snap.docs;
    totalCounts[key] = docs.length;

    const BATCH_SIZE = 450;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const chunk = docs.slice(i, i + BATCH_SIZE);
      const batch = adminDb.batch();
      for (const docSnap of chunk) {
        batch.update(docSnap.ref, {
          departmentId: newDepartmentId,
          supervisorId: newSupervisorId,
          updatedAt: nowIso,
        });
      }
      await batch.commit();
    }
  }

  return totalCounts;
}

// GET: ດຶງຂໍ້ມູນສຳລັບໜ້າ Approvals (Interns, Departments, Admins)
export async function GET(req: NextRequest) {
  const authResult = await verifyApiAuth(req, ['superadmin']);
  if (!authResult.user) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status || 401 });
  }

  try {
    // 1. ດຶງ Interns ທັງໝົດ
    const internsSnap = await adminDb
      .collection('users')
      .where('role', '==', 'intern')
      .get();

    const interns = internsSnap.docs.map((doc: QueryDocumentSnapshot) => ({
      uid: doc.id,
      ...doc.data(),
    }));

    // 2. ດຶງ Departments ທັງໝົດ
    const deptsSnap = await adminDb.collection('departments').get();
    const departments = deptsSnap.docs.map((doc: QueryDocumentSnapshot) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // 3. ດຶງ Admins ທັງໝົດ (ສຳລັບເລືອກ supervisorId)
    const adminsSnap = await adminDb
      .collection('users')
      .where('role', 'in', ['admin', 'superadmin'])
      .get();

    const admins = adminsSnap.docs.map((doc: QueryDocumentSnapshot) => ({
      uid: doc.id,
      fullname: doc.data().fullname || doc.data().email,
      email: doc.data().email,
      departmentId: doc.data().departmentId || null,
      role: doc.data().role,
    }));

    return NextResponse.json({
      interns,
      departments,
      admins,
    });
  } catch (error: any) {
    console.error('Error in GET /api/superadmin/approvals:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: ອະນຸມັດ, ປະຕິເສດ, ລະງັບ, ຫຼື ມອບໝາຍທີມໃຫ້ນັກສຶກສາ
export async function POST(req: NextRequest) {
  const authResult = await verifyApiAuth(req, ['superadmin']);
  if (!authResult.user) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status || 401 });
  }

  try {
    const body = await req.json();
    const { internId, action, departmentId, supervisorId, reason } = body;

    if (!internId || !action) {
      return NextResponse.json({ error: 'ກະລຸນາລະບຸ internId ແລະ action' }, { status: 400 });
    }

    const internRef = adminDb.collection('users').doc(internId);
    const internSnap = await internRef.get();

    if (!internSnap.exists) {
      return NextResponse.json({ error: 'ບໍ່ພົບຂໍ້ມູນນັກສຶກສາຜູ້ນີ້' }, { status: 404 });
    }

    const currentData = internSnap.data() || {};
    let newStatus = currentData.status;
    let newDept = currentData.departmentId || null;
    let newSup = currentData.supervisorId || null;

    if (action === 'approve') {
      newStatus = 'approved';
      if (departmentId !== undefined) newDept = departmentId;
      if (supervisorId !== undefined) newSup = supervisorId;
    } else if (action === 'reject') {
      newStatus = 'rejected';
    } else if (action === 'suspend') {
      newStatus = 'suspended';
    } else if (action === 'activate') {
      newStatus = 'approved';
    } else if (action === 'reassign') {
      if (departmentId !== undefined) newDept = departmentId;
      if (supervisorId !== undefined) newSup = supervisorId;
    } else {
      return NextResponse.json({ error: 'action ບໍ່ຖືກຕ້ອງ' }, { status: 400 });
    }

    const isReassigned = (departmentId !== undefined && newDept !== currentData.departmentId) ||
                         (supervisorId !== undefined && newSup !== currentData.supervisorId);

    const updatePayload: Record<string, any> = {
      status: newStatus,
      departmentId: newDept,
      supervisorId: newSup,
      updatedAt: new Date().toISOString(),
    };

    await internRef.update(updatePayload);

    // Sync custom claim
    try {
      await adminAuth.setCustomUserClaims(internId, {
        role: currentData.role || 'intern',
        status: newStatus,
      });
    } catch (claimErr: any) {
      console.warn('Could not sync custom claim:', claimErr.message);
    }

    // Batch update all documents across attendance, daily_reports, leave_requests if reassigned
    let batchCounts = null;
    if (isReassigned) {
      batchCounts = await batchUpdateInternDocuments(internId, newDept, newSup);
    }

    // Record audit log
    await recordAuditLog({
      actorId: authResult.user.uid,
      actorRole: authResult.user.role,
      action: `INTERN_${action.toUpperCase()}`,
      targetType: 'user',
      targetId: internId,
      before: {
        status: currentData.status,
        departmentId: currentData.departmentId,
        supervisorId: currentData.supervisorId,
      },
      after: {
        status: newStatus,
        departmentId: newDept,
        supervisorId: newSup,
        batchUpdatedCounts: batchCounts,
      },
      reason: reason || `Performed action ${action} by Super Admin`,
    });

    return NextResponse.json({
      success: true,
      message: `ດຳເນີນການ ${action} ສຳເລັດແລ້ວ`,
      data: {
        internId,
        status: newStatus,
        departmentId: newDept,
        supervisorId: newSup,
        batchCounts,
      },
    });
  } catch (error: any) {
    console.error('Error in POST /api/superadmin/approvals:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
