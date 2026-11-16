#!/usr/bin/env node
/**
 * Migration Script: ອັບເກຣດ Users ແລະ ຕັ້ງ Custom Claims (Interns + Admins + Superadmins)
 * 
 * ວິທີໃຊ້:
 * 1. ທົດລອງກວດສອບກ່ອນ (Dry-run ບໍ່ແກ້ໄຂຖານຂໍ້ມູນແທ້):
 *    node scripts/migrate-legacy-users.mjs --dry-run
 * 
 * 2. ແລ່ນປັບປຸງຕົວຈິງ:
 *    node scripts/migrate-legacy-users.mjs --apply
 * 
 * 3. ຕັ້ງສະເພາະ Admins:
 *    node scripts/migrate-legacy-users.mjs --apply --admins-only
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

const isApply = process.argv.includes('--apply');
const isDryRun = !isApply || process.argv.includes('--dry-run');
const adminsOnly = process.argv.includes('--admins-only');

console.log('\n========================================================');
console.log(`📦 Migration Script: Users & Custom Claims v2`);
console.log(`   - ໂໝດ: ${isDryRun ? '🔍 DRY-RUN (ກວດສອບເທົ່ານັ້ນ ບໍ່ຂຽນແທ້)' : '⚡ APPLY (ບັນທຶກແທ້)'}`);
console.log(`   - ຂອບເຂດ: ${adminsOnly ? 'ສະເພາະ Admins & Superadmins' : 'ທຸກບັນຊີ (Interns + Admins)'}`);
console.log('========================================================\n');

async function migrate() {
  try {
    const usersSnap = await db.collection('users').get();
    console.log(`🔍 ພົບບັນຊີທັງໝົດໃນ Firestore: ${usersSnap.size} ບັນຊີ\n`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const doc of usersSnap.docs) {
      const data = doc.data();
      const uid = doc.id;
      const updates = {};

      // 1. Role
      let role = data.role;
      if (!role) {
        role = 'intern';
        updates.role = 'intern';
      }

      if (adminsOnly && role !== 'admin' && role !== 'superadmin') {
        continue;
      }

      // 2. Status
      let status = data.status;
      if (!status) {
        status = 'approved';
        updates.status = 'approved';
      }

      // 3. Check v2 Fields
      if (role === 'intern') {
        if (data.departmentId === undefined) updates.departmentId = null;
        if (data.supervisorId === undefined) updates.supervisorId = null;
        if (data.skills === undefined) updates.skills = [];
        if (data.finalGrade === undefined) updates.finalGrade = null;
      }

      console.log(`👤 [${role.toUpperCase()}] ${data.fullname || data.email || 'No name'} (${uid})`);
      console.log(`   - Role: ${role} | Status: ${status}`);

      if (Object.keys(updates).length > 0) {
        console.log(`   - Updates:`, JSON.stringify(updates));
      }

      if (!isDryRun) {
        // Update Firestore
        if (Object.keys(updates).length > 0) {
          updates.updatedAt = new Date().toISOString();
          await db.collection('users').doc(uid).update(updates);
        }

        // Sync Custom Claims in Firebase Auth
        try {
          await auth.setCustomUserClaims(uid, { role, status });
          console.log(`   ⚡ Custom Claims synced: { role: "${role}", status: "${status}" }`);
        } catch (cErr) {
          console.warn(`   ⚠️ ບໍ່ສາມາດ sync custom claims: ${cErr.message}`);
        }
        console.log(`   ✅ ສຳເລັດ`);
        updatedCount++;
      } else {
        console.log(`   [Dry-run] ຈະຕັ້ງ custom claims: { role: "${role}", status: "${status}" }`);
        updatedCount++;
      }
      console.log('');
    }

    console.log('--------------------------------------------------------');
    console.log(`📊 ສະຫຼຸບຜົນ:`);
    console.log(`   - ບັນຊີທີ່ກວດສອບ: ${updatedCount}`);
    if (isDryRun) {
      console.log(`\n💡 ນີ້ເປັນພຽງການທົດລອງ (Dry-run). ຖ້າຕ້ອງການແລ່ນຈິງ ໃຫ້ໃຊ້:`);
      console.log(`   node scripts/migrate-legacy-users.mjs --apply\n`);
    } else {
      console.log(`\n🎉 ອັບເກຣດ Users & Custom Claims ສຳເລັດຮຽບຮ້ອຍແລ້ວ!\n`);
    }
  } catch (err) {
    console.error('❌ ເກີດຂໍ້ຜິດພາດ:', err.message);
    process.exit(1);
  }
}

migrate();
