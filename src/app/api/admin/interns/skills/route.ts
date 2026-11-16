import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyApiAuth, recordAuditLog } from '@/lib/api-auth';
import { Skill } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const { user, error, status } = await verifyApiAuth(req, ['admin', 'superadmin']);
    if (error || !user) {
      return NextResponse.json({ error }, { status: status || 401 });
    }

    const body = await req.json();
    const { internId, skills } = body;

    if (!internId) {
      return NextResponse.json({ error: 'ກະລຸນາລະບຸ internId' }, { status: 400 });
    }

    if (!Array.isArray(skills)) {
      return NextResponse.json({ error: 'ຂໍ້ມູນ skills ຕ້ອງເປັນ Array' }, { status: 400 });
    }

    // Validate skills items
    for (const s of skills) {
      if (!s.name || typeof s.name !== 'string') {
        return NextResponse.json({ error: 'ຊື່ທັກສະ (skill name) ຕ້ອງເປັນຂໍ້ຄວາມ' }, { status: 400 });
      }
      const num = Number(s.percent);
      if (isNaN(num) || num < 0 || num > 100) {
        return NextResponse.json({ error: `ຄະແນນທັກສະ "${s.name}" ຕ້ອງຢູ່ລະຫວ່າງ 0 ຫາ 100` }, { status: 400 });
      }
    }

    const internRef = adminDb.collection('users').doc(internId);
    const internSnap = await internRef.get();

    if (!internSnap.exists) {
      return NextResponse.json({ error: 'ບໍ່ພົບຂໍ້ມູນນັກສຶກສານີ້' }, { status: 404 });
    }

    const internData = internSnap.data() || {};

    // ກວດສອບສິດ Admin
    if (user.role === 'admin' && internData.supervisorId !== user.uid) {
      return NextResponse.json({ error: 'ທ່ານບໍ່ມີສິດປະເມີນທັກສະໃຫ້ນັກສຶກສານອກທີມ' }, { status: 403 });
    }

    const cleanedSkills: Skill[] = skills.map((s: any) => ({
      name: String(s.name).trim(),
      percent: Math.min(100, Math.max(0, Math.round(Number(s.percent)))),
      note: s.note ? String(s.note).trim() : '',
    }));

    const beforeSkills = internData.skills || [];
    const nowIso = new Date().toISOString();

    await internRef.update({
      skills: cleanedSkills,
      updatedAt: nowIso,
    });

    // ບັນທຶກ Audit Log
    await recordAuditLog({
      actorId: user.uid,
      actorRole: user.role,
      action: 'update_intern_skills',
      targetType: 'user',
      targetId: internId,
      before: { skills: beforeSkills },
      after: { skills: cleanedSkills },
      reason: `Updated ${cleanedSkills.length} skills for intern ${internData.fullname || internId}`,
    });

    return NextResponse.json({
      success: true,
      message: 'ບັນທຶກການປະເມີນທັກສະຮຽບຮ້ອຍແລ້ວ',
      skills: cleanedSkills,
    });
  } catch (err: any) {
    console.error('Error saving intern skills:', err);
    return NextResponse.json({ error: 'ເກີດຂໍ້ຜິດພາດ: ' + err.message }, { status: 500 });
  }
}
