import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyApiAuth } from '@/lib/api-auth';
import {
  getVientianeDateString,
  getVientianeTimeString,
  DEFAULT_SYSTEM_SETTINGS,
} from '@/lib/attendance-rules';
import { SystemSettings } from '@/types';

export async function GET(req: NextRequest) {
  const authResult = await verifyApiAuth(req, ['intern', 'admin', 'superadmin']);
  if (!authResult.user) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status || 401 });
  }

  const { uid } = authResult.user;

  try {
    const now = new Date();
    const todayDate = getVientianeDateString(now);
    const serverTime = getVientianeTimeString(now);

    // Fetch settings
    let settings = DEFAULT_SYSTEM_SETTINGS;
    try {
      const settingsSnap = await adminDb.collection('settings').doc('system').get();
      if (settingsSnap.exists) {
        settings = { ...DEFAULT_SYSTEM_SETTINGS, ...settingsSnap.data() } as SystemSettings;
      }
    } catch (e) {
      // fallback
    }

    // Fetch today's attendance for this user
    const docId = `${uid}_${todayDate}`;
    const attendanceSnap = await adminDb.collection('attendance').doc(docId).get();
    const attendance = attendanceSnap.exists ? { id: attendanceSnap.id, ...attendanceSnap.data() } : null;

    return NextResponse.json({
      todayDate,
      serverTime,
      settings,
      attendance,
    });
  } catch (error: any) {
    console.error('Error fetching today attendance:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
