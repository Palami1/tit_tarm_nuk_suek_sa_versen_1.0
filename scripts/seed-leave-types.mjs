#!/usr/bin/env node
/**
 * Script ສຳລັບສ້າງຂໍ້ມູນປະເພດການລາພັກເລີ່ມຕົ້ນ (Seed) ລົງ collection leave_types
 * 
 * ວິທີໃຊ້:
 * node scripts/seed-leave-types.mjs
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
  console.error('❌ Error: Firebase Admin credentials not found in .env.local.');
  process.exit(1);
}

const db = admin.firestore(app);

const DEFAULT_LEAVE_TYPES = [
  {
    id: 'annual',
    name: 'ລາພັກປະຈຳປີ',
    quotaPerYear: 15,
    requiresDocument: false,
    active: true,
    order: 1,
  },
  {
    id: 'personal',
    name: 'ລາກິດທຸລະສ່ວນຕົວ',
    quotaPerYear: null,
    requiresDocument: false,
    active: true,
    order: 2,
  },
  {
    id: 'sick',
    name: 'ລາເຈັບປ່ວຍ',
    quotaPerYear: null,
    requiresDocument: true,
    active: true,
    order: 3,
  },
  {
    id: 'official',
    name: 'ກິດທຸລະຂ້ອງການ',
    quotaPerYear: null,
    requiresDocument: false,
    active: true,
    order: 4,
  },
];

async function seedLeaveTypes() {
  console.log('--- ເລີ່ມຕົ້ນ Seed ຂໍ້ມູນປະເພດການລາພັກ (leave_types) ---');

  for (const lt of DEFAULT_LEAVE_TYPES) {
    const docRef = db.collection('leave_types').doc(lt.id);
    const snap = await docRef.get();

    if (!snap.exists) {
      await docRef.set({
        name: lt.name,
        quotaPerYear: lt.quotaPerYear,
        requiresDocument: lt.requiresDocument,
        active: lt.active,
        order: lt.order,
        createdAt: new Date().toISOString(),
      });
      console.log(`✅ ສ້າງປະເພດ: ${lt.name} (ID: ${lt.id}, ໂຄຕ້າ: ${lt.quotaPerYear ?? 'ບໍ່ຈຳກັດ'})`);
    } else {
      console.log(`ℹ️ ມີແລ້ວ: ${lt.name} (ID: ${lt.id})`);
    }
  }

  console.log('--- ສຳເລັດການ Seed leave_types ---');
  process.exit(0);
}

seedLeaveTypes().catch(err => {
  console.error('❌ Error seeding leave types:', err);
  process.exit(1);
});
