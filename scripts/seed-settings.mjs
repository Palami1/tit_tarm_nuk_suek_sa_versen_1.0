#!/usr/bin/env node
/**
 * Script ສຳລັບສ້າງຂໍ້ມູນເລີ່ມຕົ້ນ (Seed) ລົງ settings/system
 * 
 * ວິທີໃຊ້:
 * node scripts/seed-settings.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ໂຫຼດ .env.local ຖ້າມີ
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  });
}

// Initialize Firebase Admin
let app;
if (admin.apps.length > 0) {
  app = admin.app();
} else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  app = admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
  });
} else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
  app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID || 'ltc-intern-system',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
} else {
  app = admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || 'ltc-intern-system',
  });
}

const db = admin.firestore(app);

const DEFAULT_SETTINGS = {
  offices: [
    {
      name: 'LTC Headquarter (ສຳນັກງານໃຫຍ່)',
      lat: 17.969900946492515,
      lng: 102.6123789072009,
      radius: 200,
      active: true,
    },
  ],
  workStart: '08:00',
  workEnd: '17:00',
  graceMinutes: 0,
  checkInWindow: { from: '06:00', to: '12:00' },
  checkOutWindow: { from: '12:00', to: '22:00' },
  lunchBreakHours: 1,
  lunchThresholdHours: 5,
  maxGpsAccuracy: 50,
  leaveApprovalBackdateDays: 7,
  gradeThresholds: { A: 80, B: 70, C: 60, D: 50 },
  timezone: 'Asia/Vientiane',
  halfDay: {
    morningLeave: {
      checkInWindow: { from: '06:00', to: '16:00' },
      checkInCutoff: '13:00:00',
      checkOutCutoff: '17:00:00',
    },
    afternoonLeave: {
      checkInCutoff: '08:00:00',
      checkOutWindow: { from: '11:00', to: '22:00' },
      checkOutCutoff: '12:00:00',
    },
  },
  updatedAt: new Date().toISOString(),
};

async function seed() {
  console.log('\n⚙️ ກຳລັງສ້າງ/ອັບເດດ settings/system ດ້ວຍຄ່າເລີ່ມຕົ້ນ...');
  try {
    const docRef = db.collection('settings').doc('system');
    await docRef.set(DEFAULT_SETTINGS, { merge: true });

    // Record audit log
    try {
      await db.collection('audit_logs').add({
        actorId: 'CLI_SEED',
        actorRole: 'system',
        action: 'SEED_SETTINGS',
        targetType: 'settings',
        targetId: 'system',
        after: DEFAULT_SETTINGS,
        reason: 'Initial seed of system settings via script',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {}

    console.log('✅ ສຳເລັດ! ບັນທຶກ settings/system ຮຽບຮ້ອຍແລ້ວ:');
    console.log(JSON.stringify(DEFAULT_SETTINGS, null, 2));
    console.log('\n');
  } catch (err) {
    console.error('❌ ເກີດຂໍ້ຜິດພາດ:', err.message);
    process.exit(1);
  }
}

seed();
