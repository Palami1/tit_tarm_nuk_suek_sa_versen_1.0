import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyApiAuth } from '@/lib/api-auth';

const MAX_FILE_SIZE = 700 * 1024; // 700 KB (716,800 bytes)
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

// POST: ອັບໂຫຼດເອກະສານແນບ
export async function POST(req: NextRequest) {
  try {
    const { user, error, status } = await verifyApiAuth(req);
    if (error || !user) {
      return NextResponse.json({ error }, { status: status || 401 });
    }

    const body = await req.json();
    const { fileName, fileType, base64Data } = body;

    if (!fileName || !fileType || !base64Data) {
      return NextResponse.json({ error: 'ກະລຸນາສົ່ງຂໍ້ມູນໄຟລ໌ໃຫ້ຄົບຖ້ວນ (fileName, fileType, base64Data)' }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.includes(fileType.toLowerCase())) {
      return NextResponse.json({
        error: 'ປະເພດໄຟລ໌ບໍ່ຖືກຕ້ອງ. ອະນຸຍາດສະເພາະ JPG, PNG, WEBP ຫຼື PDF ເທົ່ານັ້ນ',
      }, { status: 400 });
    }

    // ຄຳນວນຂະໜາດໄຟລ໌ຕົວຈິງຈາກ base64
    const base64Clean = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const approximateBytes = Math.round((base64Clean.length * 3) / 4);

    if (approximateBytes > MAX_FILE_SIZE) {
      return NextResponse.json({
        error: `ຂະໜາດໄຟລ໌ໃຫຍ່ເກີນໄປ (${(approximateBytes / 1024).toFixed(0)} KB). ຈຳກັດສູງສຸດບໍ່ເກີນ 700 KB`,
      }, { status: 400 });
    }

    const docRef = await adminDb.collection('leave_attachments').add({
      userId: user.uid,
      fileName: String(fileName).slice(0, 100),
      fileType: fileType.toLowerCase(),
      fileSize: approximateBytes,
      base64Data, // data url
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      attachmentId: docRef.id,
      fileName,
      fileSize: approximateBytes,
    });
  } catch (err: any) {
    console.error('Attachment upload error:', err);
    return NextResponse.json({ error: 'ເກີດຂໍ້ຜິດພາດໃນການອັບໂຫຼດໄຟລ໌: ' + err.message }, { status: 500 });
  }
}

// GET: ດາວໂຫຼດ/ເບິ່ງເອກະສານແນບ
export async function GET(req: NextRequest) {
  try {
    const { user, error, status } = await verifyApiAuth(req);
    if (error || !user) {
      return NextResponse.json({ error }, { status: status || 401 });
    }

    const { searchParams } = new URL(req.url);
    const attachmentId = searchParams.get('id');

    if (!attachmentId) {
      return NextResponse.json({ error: 'ກະລຸນາລະບຸ attachmentId' }, { status: 400 });
    }

    const docSnap = await adminDb.collection('leave_attachments').doc(attachmentId).get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: 'ບໍ່ພົບເອກະສານແນບນີ້' }, { status: 404 });
    }

    const data = docSnap.data() || {};

    // ກວດສອບສິດ: ເຈົ້າຂອງໄຟລ໌, Supervisor ຂອງລາວ, ຫຼື Superadmin
    let isAuthorized = false;
    if (data.userId === user.uid) {
      isAuthorized = true;
    } else if (user.role === 'superadmin') {
      isAuthorized = true;
    } else if (user.role === 'admin') {
      // ກວດວ່າ intern ນີ້ຢູ່ໃຕ້ supervisor ນີ້ບໍ່
      const internSnap = await adminDb.collection('users').doc(data.userId).get();
      if (internSnap.exists && internSnap.data()?.supervisorId === user.uid) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'ທ່ານບໍ່ມີສິດເຂົ້າເຖິງເອກະສານແນບນີ້' }, { status: 403 });
    }

    return NextResponse.json({
      id: docSnap.id,
      fileName: data.fileName,
      fileType: data.fileType,
      fileSize: data.fileSize,
      base64Data: data.base64Data,
      createdAt: data.createdAt,
    });
  } catch (err: any) {
    console.error('Attachment fetch error:', err);
    return NextResponse.json({ error: 'ເກີດຂໍ້ຜິດພາດ: ' + err.message }, { status: 500 });
  }
}
