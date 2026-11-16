import { NextRequest } from 'next/server';
import { adminAuth, adminDb, FieldValue } from '@/lib/firebase-admin';
import { UserRole } from '@/types';

export interface AuthenticatedUser {
  uid: string;
  email: string;
  role: UserRole;
  status: string;
  departmentId?: string | null;
  supervisorId?: string | null;
}

export async function verifyApiAuth(
  req: NextRequest,
  allowedRoles?: UserRole[]
): Promise<{ user: AuthenticatedUser | null; error?: string; status?: number }> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'Unauthorized: Missing or invalid Authorization header', status: 401 };
  }

  const token = authHeader.split('Bearer ')[1].trim();
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    
    // Check Firestore user doc for latest role and status
    const userDoc = await adminDb.collection('users').doc(decoded.uid).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    
    // Firestore doc ແມ່ນ Real-time Source of Truth ສຳລັບ role & status
    // ເພື່ອໃຫ້ມີຜົນທັນທີ ໂດຍບໍ່ຕ້ອງລໍຖ້າ token ໝົດອາຍຸ 1 ຊົ່ວໂມງ
    const role = ((userData?.role as UserRole) || (decoded.role as UserRole) || 'intern') as UserRole;
    const status = (userData?.status || (decoded.status as string) || 'pending') as string;

    if (allowedRoles && !allowedRoles.includes(role)) {
      return { user: null, error: `Forbidden: Role '${role}' is not authorized`, status: 403 };
    }

    return {
      user: {
        uid: decoded.uid,
        email: decoded.email || userData?.email || '',
        role,
        status,
        departmentId: userData?.departmentId || null,
        supervisorId: userData?.supervisorId || null,
      },
    };
  } catch (err: any) {
    console.error('API token verification failed:', err.message);
    return { user: null, error: 'Unauthorized: Invalid or expired token', status: 401 };
  }
}

export async function recordAuditLog(payload: {
  actorId: string;
  actorRole: UserRole | string;
  action: string;
  targetType: string;
  targetId: string;
  before?: any;
  after?: any;
  reason?: string;
}) {
  try {
    await adminDb.collection('audit_logs').add({
      ...payload,
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
