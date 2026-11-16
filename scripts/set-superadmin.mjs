#!/usr/bin/env node
/**
 * Script ສຳລັບຕັ້ງ Super Admin ຄົນທຳອິດໃນລະບົບ LTC Intern Tracking System v2
 * 
 * ວິທີໃຊ້:
 * node scripts/set-superadmin.mjs your-email@laotel.com
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

const auth = admin.auth(app);
const db = admin.firestore(app);

const targetEmail = process.argv[2]?.trim().toLowerCase();

if (!targetEmail) {
  console.error('\n❌ ກະລຸນາໃສ່ອີເມວຂອງ Super Admin ທີ່ຕ້ອງການຕັ້ງ!');
  console.log('ຕົວຢ່າງການນຳໃຊ້:');
  console.log('  node scripts/set-superadmin.mjs admin@laotel.com\n');
  process.exit(1);
}

async function main() {
  console.log(`\n🔍 ກຳລັງຄົ້ນຫາຜູ້ໃຊ້ດ້ວຍອີເມວ: ${targetEmail}...`);
  try {
    const user = await auth.getUserByEmail(targetEmail);
    console.log(`✅ ພົບບັນຊີ: ${user.uid} (${user.email})`);

    // 1. ຕັ້ງ Custom Claim ເປັນ superadmin
    console.log('⚡ ກຳລັງຕັ້ງ Custom Claims: { role: "superadmin" }...');
    await auth.setCustomUserClaims(user.uid, { role: 'superadmin' });

    // 2. ອັບເດດໃນ Firestore users collection
    console.log('⚡ ກຳລັງອັບເດດຂໍ້ມູນໃນ Firestore users collection...');
    const userRef = db.collection('users').doc(user.uid);
    const docSnap = await userRef.get();

    const updatePayload = {
      role: 'superadmin',
      status: 'approved',
      updatedAt: new Date().toISOString(),
    };

    if (docSnap.exists) {
      await userRef.update(updatePayload);
    } else {
      await userRef.set({
        uid: user.uid,
        email: user.email,
        fullname: user.displayName || 'Super Admin',
        phone: user.phoneNumber || '',
        ...updatePayload,
        createdAt: new Date().toISOString(),
      });
    }

    // 3. ບັນທຶກ Audit Log
    try {
      await db.collection('audit_logs').add({
        actorId: 'CLI_SCRIPT',
        actorRole: 'system',
        action: 'SET_SUPERADMIN',
        targetType: 'user',
        targetId: user.uid,
        before: docSnap.exists ? docSnap.data()?.role : null,
        after: 'superadmin',
        reason: 'Set initial Super Admin via CLI script',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (logErr) {
      console.warn('⚠️ ບໍ່ສາມາດບັນທຶກ audit log (ຂ້າມໄດ້):', logErr.message);
    }

    console.log('\n======================================================');
    console.log('🎉 ສຳເລັດ! ຕັ້ງ Super Admin ຮຽບຮ້ອຍແລ້ວ:');
    console.log(`   - UID:      ${user.uid}`);
    console.log(`   - Email:    ${user.email}`);
    console.log(`   - Role:     superadmin`);
    console.log(`   - Status:   approved`);
    console.log('======================================================\n');
    console.log('💡 ຄຳແນະນຳ: ໃຫ້ User ອອກຈາກລະບົບ ແລ້ວເຂົ້າສູ່ລະບົບໃໝ່ ເພື່ອໃຫ້ Token ອັບເດດ Custom Claim.\n');
  } catch (error) {
    console.error('\n❌ ເກີດຂໍ້ຜິດພາດ:', error.message);
    process.exit(1);
  }
}

main();
